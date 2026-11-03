# -*- coding: utf-8 -*-
"""
servicio_impresora.py
=====================
Servicio local (Flask, puerto 5000) que actúa como driver de una mini impresora
térmica Bluetooth Low Energy (57 mm / 384 px) para el sistema FacturaK.

Endpoints:
    POST /imprimir       -> maqueta e imprime un ticket con los datos de FacturaK
    POST /configurar     -> guarda la MAC de la impresora en config_impresora.json
    GET  /status         -> MAC configurada y estado (?probar=1 intenta conectar)
    GET  /escanear       -> (extra) lista dispositivos BLE cercanos para hallar la MAC
    POST /vista-previa   -> (extra) devuelve el ticket como PNG sin imprimir

Requiere Python 3.10+  (ver requirements.txt)
"""

import asyncio
import io
import json
import logging
import os
import re
import struct
import sys
import threading
import time
from datetime import datetime

from bleak import BleakClient, BleakScanner
from flask import Flask, jsonify, request, send_file
from PIL import Image, ImageDraw, ImageFont, ImageOps

# --------------------------------------------------------------------------- #
# 0. Entorno: rutas, logging y protección para --noconsole de PyInstaller
# --------------------------------------------------------------------------- #
# Carpeta donde viven el .exe (o el .py) -> ahí se guardan config y log.
BASE_DIR = (
    os.path.dirname(sys.executable)
    if getattr(sys, "frozen", False)
    else os.path.dirname(os.path.abspath(__file__))
)
CONFIG_PATH = os.path.join(BASE_DIR, "config_impresora.json")
LOG_PATH = os.path.join(BASE_DIR, "servicio_impresora.log")

# Con --noconsole, sys.stdout/sys.stderr son None y Flask/werkzeug fallaría al escribir.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_PATH, encoding="utf-8")],
)
log = logging.getLogger("impresora")

# --------------------------------------------------------------------------- #
# 1. Constantes de la impresora
# --------------------------------------------------------------------------- #
ANCHO_PX = 384            # 57/58 mm -> 384 puntos
ANCHO_BYTES = ANCHO_PX // 8
BANDA_FILAS = 128         # filas por comando raster (evita desbordar el buffer)
UMBRAL_BN = 170           # umbral blanco/negro (más alto = trazo más oscuro)

# UUIDs de característica de escritura habituales en impresoras BLE ESC/POS chinas.
# Si no aparece ninguno, se usa la primera característica con permiso de escritura.
UUIDS_ESCRITURA_PREFERIDOS = [
    "0000ff02-0000-1000-8000-00805f9b34fb",   # Goojprt / PT-210 / muchas "genéricas"
    "00002af1-0000-1000-8000-00805f9b34fb",   # servicio 18F0 (iPrint / Fun Print)
    "0000ae01-0000-1000-8000-00805f9b34fb",   # servicio AE30 (algunas "gatito")
    "49535343-8841-43f4-a8d4-ecbe34729bb3",   # ISSC (algunos clones)
]

PAUSA_ENTRE_CHUNKS = 0.03   # segundos; sube a 0.06 si la impresora pierde datos
CHUNK_MAX = 128             # bytes máximos por escritura GATT
REINTENTOS = 3
TIMEOUT_CONEXION = 15       # segundos

RE_MAC = re.compile(r"^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$")

# --------------------------------------------------------------------------- #
# 2. Configuración persistente (config_impresora.json)
# --------------------------------------------------------------------------- #
_cfg_lock = threading.Lock()


def cargar_config() -> dict:
    with _cfg_lock:
        if not os.path.exists(CONFIG_PATH):
            return {}
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            log.error("No se pudo leer la configuración: %s", e)
            return {}


def guardar_config(cfg: dict) -> None:
    with _cfg_lock:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)


# --------------------------------------------------------------------------- #
# 3. Maquetación del ticket con Pillow
# --------------------------------------------------------------------------- #
def cargar_fuente(negrita: bool, tam: int) -> ImageFont.FreeTypeFont:
    """Busca una fuente TrueType en Windows (y alternativas); si no, usa la de Pillow."""
    candidatos = (
        ["C:/Windows/Fonts/arialbd.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]
        if negrita
        else ["C:/Windows/Fonts/arial.ttf", "arial.ttf", "DejaVuSans.ttf"]
    )
    for ruta in candidatos:
        try:
            return ImageFont.truetype(ruta, tam)
        except OSError:
            continue
    return ImageFont.load_default(tam)  # Pillow >= 10.1


F_TITULO = cargar_fuente(True, 30)
F_NORMAL = cargar_fuente(False, 21)
F_NEGRITA = cargar_fuente(True, 21)
F_PEQ = cargar_fuente(False, 17)
F_TOTAL = cargar_fuente(True, 32)


def fmt_num(valor, moneda: str = "") -> str:
    try:
        return f"{moneda}{float(valor):,.2f}"
    except (TypeError, ValueError):
        return f"{moneda}0.00"


def fmt_cant(valor) -> str:
    try:
        v = float(valor)
        return str(int(v)) if v.is_integer() else f"{v:.2f}"
    except (TypeError, ValueError):
        return "1"


class Lienzo:
    """Pequeño 'cursor vertical' sobre una imagen en escala de grises de 384 px."""

    MARGEN = 8

    def __init__(self, alto_max: int):
        self.img = Image.new("L", (ANCHO_PX, alto_max), 255)
        self.d = ImageDraw.Draw(self.img)
        self.y = 6

    @staticmethod
    def _alto_linea(fuente) -> int:
        return int(fuente.size * 1.3)

    def ancho(self, texto, fuente) -> float:
        return self.d.textlength(texto, font=fuente)

    def envolver(self, texto: str, fuente, ancho_max: int) -> list[str]:
        """Parte un texto en líneas que quepan en ancho_max píxeles."""
        lineas, actual = [], ""
        for palabra in str(texto).split():
            # Palabra más larga que la columna -> cortar por caracteres
            while self.ancho(palabra, fuente) > ancho_max:
                corte = len(palabra)
                while corte > 1 and self.ancho(palabra[:corte], fuente) > ancho_max:
                    corte -= 1
                if actual:
                    lineas.append(actual)
                    actual = ""
                lineas.append(palabra[:corte])
                palabra = palabra[corte:]
            prueba = f"{actual} {palabra}".strip()
            if self.ancho(prueba, fuente) <= ancho_max:
                actual = prueba
            else:
                lineas.append(actual)
                actual = palabra
        if actual:
            lineas.append(actual)
        return lineas or [""]

    def centrado(self, texto, fuente):
        for linea in self.envolver(texto, fuente, ANCHO_PX - 2 * self.MARGEN):
            x = (ANCHO_PX - self.ancho(linea, fuente)) / 2
            self.d.text((x, self.y), linea, font=fuente, fill=0)
            self.y += self._alto_linea(fuente)

    def izquierda(self, texto, fuente):
        for linea in self.envolver(texto, fuente, ANCHO_PX - 2 * self.MARGEN):
            self.d.text((self.MARGEN, self.y), linea, font=fuente, fill=0)
            self.y += self._alto_linea(fuente)

    def par(self, izq, der, fuente):
        """Texto a la izquierda y valor alineado a la derecha en la misma línea."""
        self.d.text((self.MARGEN, self.y), str(izq), font=fuente, fill=0)
        x = ANCHO_PX - self.MARGEN - self.ancho(str(der), fuente)
        self.d.text((x, self.y), str(der), font=fuente, fill=0)
        self.y += self._alto_linea(fuente)

    def separador(self, grosor=2, punteado=True):
        self.y += 4
        x = self.MARGEN
        while x < ANCHO_PX - self.MARGEN:
            fin = min(x + (8 if punteado else ANCHO_PX), ANCHO_PX - self.MARGEN)
            self.d.line([(x, self.y), (fin, self.y)], fill=0, width=grosor)
            x += 14 if punteado else ANCHO_PX
        self.y += 8

    def espacio(self, px: int):
        self.y += px

    def resultado(self) -> Image.Image:
        return self.img.crop((0, 0, ANCHO_PX, self.y + 10))


def maquetar_ticket(datos: dict) -> Image.Image:
    """Construye la imagen del ticket (384 px de ancho, alto dinámico)."""
    productos = datos.get("productos", [])
    moneda = datos.get("moneda", "")
    lienzo = Lienzo(alto_max=900 + 160 * len(productos))
    m = Lienzo.MARGEN

    # ---- Cabecera -------------------------------------------------------- #
    lienzo.centrado(datos.get("empresa", "FACTURAK"), F_TITULO)
    for campo in ("rif", "direccion", "telefono"):
        if datos.get(campo):
            lienzo.centrado(datos[campo], F_PEQ)
    lienzo.separador()
    lienzo.par("Factura N°:", datos.get("numero_factura", "-"), F_NEGRITA)
    lienzo.par("Fecha:", datos.get("fecha") or datetime.now().strftime("%d/%m/%Y %H:%M"), F_NORMAL)
    lienzo.izquierda(f"Cliente: {datos.get('cliente', 'Consumidor final')}", F_NORMAL)
    lienzo.separador()

    # ---- Tabla de ítems: CANT | DESCRIPCIÓN | IMPORTE ------------------- #
    col_cant, col_imp = 46, 100
    x_nombre = m + col_cant
    ancho_nombre = ANCHO_PX - 2 * m - col_cant - col_imp

    lienzo.d.text((m, lienzo.y), "Cant", font=F_PEQ, fill=0)
    lienzo.d.text((x_nombre, lienzo.y), "Descripción", font=F_PEQ, fill=0)
    x_imp = ANCHO_PX - m - lienzo.ancho("Importe", F_PEQ)
    lienzo.d.text((x_imp, lienzo.y), "Importe", font=F_PEQ, fill=0)
    lienzo.y += Lienzo._alto_linea(F_PEQ)
    lienzo.separador(grosor=1, punteado=False)

    for p in productos:
        cant = p.get("cantidad", 1)
        precio = p.get("precio", 0)
        try:
            importe = float(cant) * float(precio)
        except (TypeError, ValueError):
            importe = 0.0

        lineas = lienzo.envolver(p.get("nombre", "-"), F_NORMAL, ancho_nombre)
        y0 = lienzo.y
        lienzo.d.text((m, y0), fmt_cant(cant), font=F_NEGRITA, fill=0)
        imp_txt = fmt_num(importe)
        x_imp = ANCHO_PX - m - lienzo.ancho(imp_txt, F_NORMAL)
        lienzo.d.text((x_imp, y0), imp_txt, font=F_NORMAL, fill=0)
        for linea in lineas:
            lienzo.d.text((x_nombre, lienzo.y), linea, font=F_NORMAL, fill=0)
            lienzo.y += Lienzo._alto_linea(F_NORMAL)
        if float(cant or 0) != 1:
            lienzo.d.text((x_nombre, lienzo.y), f"c/u {fmt_num(precio, moneda)}", font=F_PEQ, fill=0)
            lienzo.y += Lienzo._alto_linea(F_PEQ)
        lienzo.espacio(4)

    lienzo.separador()

    # ---- Totales alineados a la derecha --------------------------------- #
    if datos.get("subtotal") is not None:
        lienzo.par("Subtotal:", fmt_num(datos["subtotal"], moneda), F_NORMAL)
    if datos.get("descuento"):
        lienzo.par("Descuento:", "-" + fmt_num(datos["descuento"], moneda), F_NORMAL)
    if datos.get("impuesto"):
        lienzo.par("Impuesto:", fmt_num(datos["impuesto"], moneda), F_NORMAL)
    lienzo.espacio(4)
    lienzo.par("TOTAL", fmt_num(datos["total"], moneda), F_TOTAL)
    if datos.get("metodo_pago"):
        lienzo.izquierda(f"Pago: {datos['metodo_pago']}", F_PEQ)

    # ---- Pie de página --------------------------------------------------- #
    lienzo.separador()
    lienzo.centrado(datos.get("pie", "¡Gracias por su compra!"), F_NEGRITA)
    lienzo.centrado("Generado con FacturaK", F_PEQ)
    return lienzo.resultado()


# --------------------------------------------------------------------------- #
# 4. Imagen -> comandos ESC/POS raster (GS v 0)
# --------------------------------------------------------------------------- #
def imagen_a_escpos(img: Image.Image) -> bytes:
    """
    Convierte la imagen a 1 bit (negro = 1) y genera:
        ESC @            (inicializar)
        GS v 0 m xL xH yL yH <datos>   (por bandas de BANDA_FILAS filas)
        ESC d n          (avanzar papel para poder cortarlo)
    """
    gris = img.convert("L")
    if gris.width != ANCHO_PX:  # seguridad: forzar 384 px
        alto = round(gris.height * ANCHO_PX / gris.width)
        gris = gris.resize((ANCHO_PX, alto))
    # En ESC/POS el bit 1 imprime punto negro -> invertimos antes de binarizar.
    gris = ImageOps.invert(gris).point(lambda p: 255 if p > (255 - UMBRAL_BN) else 0)
    mono = gris.convert("1", dither=Image.Dither.NONE)
    datos = mono.tobytes()                       # 1 bit/pixel, MSB primero
    alto = mono.height

    salida = bytearray(b"\x1b\x40")              # ESC @
    for ini in range(0, alto, BANDA_FILAS):
        filas = min(BANDA_FILAS, alto - ini)
        salida += b"\x1d\x76\x30\x00" + struct.pack("<HH", ANCHO_BYTES, filas)
        salida += datos[ini * ANCHO_BYTES:(ini + filas) * ANCHO_BYTES]
    salida += b"\x1b\x64\x04"                    # ESC d 4 -> avanzar 4 líneas
    return bytes(salida)


# --------------------------------------------------------------------------- #
# 5. Capa Bluetooth LE (bleak) en un hilo/event-loop propio -> Flask no se bloquea
# --------------------------------------------------------------------------- #
class TrabajadorBLE:
    """Ejecuta todas las operaciones BLE en un event loop dedicado y serializado."""

    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self._lock = asyncio.Lock()
        self.ultimo_estado = "sin_conexion_previa"
        self.ultimo_error = None
        self.ultima_impresion = None
        threading.Thread(target=self._correr, daemon=True, name="ble-loop").start()

    def _correr(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def ejecutar(self, coro, timeout: float):
        """Lanza la corrutina en el loop BLE y espera el resultado (desde hilos Flask)."""
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result(timeout)

    @staticmethod
    def _elegir_caracteristica(client: BleakClient, uuid_cfg: str | None):
        escribibles = []
        for servicio in client.services:
            for car in servicio.characteristics:
                if "write" in car.properties or "write-without-response" in car.properties:
                    escribibles.append(car)
        if not escribibles:
            raise RuntimeError("La impresora no expone ninguna característica de escritura.")
        orden = ([uuid_cfg.lower()] if uuid_cfg else []) + UUIDS_ESCRITURA_PREFERIDOS
        for uuid in orden:
            for car in escribibles:
                if car.uuid.lower() == uuid:
                    return car
        return escribibles[0]

    async def _enviar(self, mac: str, datos: bytes, uuid_cfg: str | None):
        async with self._lock:  # una impresión a la vez
            ultimo_error = None
            for intento in range(1, REINTENTOS + 1):
                try:
                    async with BleakClient(mac, timeout=TIMEOUT_CONEXION) as client:
                        self.ultimo_estado = "conectada"
                        car = self._elegir_caracteristica(client, uuid_cfg)
                        sin_resp = "write-without-response" in car.properties
                        try:
                            tam = max(20, min(int(client.mtu_size) - 3, CHUNK_MAX))
                        except Exception:
                            tam = 20
                        log.info("Enviando %d bytes a %s (char=%s, chunk=%d)",
                                 len(datos), mac, car.uuid, tam)
                        for i in range(0, len(datos), tam):
                            await client.write_gatt_char(car, datos[i:i + tam], response=not sin_resp)
                            await asyncio.sleep(PAUSA_ENTRE_CHUNKS)
                        await asyncio.sleep(0.8)  # dejar que la impresora vacíe su buffer
                    self.ultimo_estado = "desconectada_ok"
                    self.ultimo_error = None
                    self.ultima_impresion = datetime.now().isoformat(timespec="seconds")
                    return
                except Exception as e:  # noqa: BLE001
                    ultimo_error = e
                    self.ultimo_estado = "error"
                    self.ultimo_error = str(e)
                    log.warning("Intento %d/%d falló: %s", intento, REINTENTOS, e)
                    await asyncio.sleep(1.0)
            raise RuntimeError(f"No se pudo imprimir tras {REINTENTOS} intentos: {ultimo_error}")

    async def _probar(self, mac: str, uuid_cfg: str | None) -> dict:
        async with self._lock:
            async with BleakClient(mac, timeout=TIMEOUT_CONEXION) as client:
                car = self._elegir_caracteristica(client, uuid_cfg)
                return {"caracteristica": car.uuid, "propiedades": list(car.properties)}

    async def _escanear(self, segundos: float) -> list[dict]:
        encontrados = await BleakScanner.discover(timeout=segundos)
        return [{"nombre": d.name or "(sin nombre)", "mac": d.address}
                for d in sorted(encontrados, key=lambda x: (x.name is None, x.name or ""))]

    # API pública (llamada desde Flask)
    def imprimir(self, mac, datos, uuid_cfg=None):
        return self.ejecutar(self._enviar(mac, datos, uuid_cfg),
                             timeout=REINTENTOS * (TIMEOUT_CONEXION + 30) + 60)

    def probar(self, mac, uuid_cfg=None):
        return self.ejecutar(self._probar(mac, uuid_cfg), timeout=TIMEOUT_CONEXION + 10)

    def escanear(self, segundos=6.0):
        return self.ejecutar(self._escanear(segundos), timeout=segundos + 15)


ble = TrabajadorBLE()

# --------------------------------------------------------------------------- #
# 6. API REST (Flask)
# --------------------------------------------------------------------------- #
app = Flask(__name__)
app.json.ensure_ascii = False


@app.after_request
def cors(resp):
    """CORS para que FacturaK (Electron o web) pueda llamar a http://127.0.0.1:5000."""
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Private-Network"] = "true"  # Chrome PNA (https -> localhost)
    return resp


@app.route("/<path:_>", methods=["OPTIONS"])
@app.route("/", methods=["OPTIONS"])
def preflight(_=None):
    return ("", 204)


def normalizar_mac(mac: str) -> str:
    return mac.strip().replace("-", ":").upper()


def validar_ticket(d) -> tuple[dict | None, str | None]:
    """Valida y completa el JSON recibido de FacturaK."""
    if not isinstance(d, dict):
        return None, "El cuerpo debe ser un objeto JSON."
    productos = d.get("productos")
    if not isinstance(productos, list) or not productos:
        return None, "'productos' debe ser una lista con al menos un elemento."
    for i, p in enumerate(productos, 1):
        if not isinstance(p, dict) or "nombre" not in p or "precio" not in p:
            return None, f"El producto #{i} requiere al menos 'nombre' y 'precio'."
        p.setdefault("cantidad", 1)
    if d.get("total") is None:  # si FacturaK no lo envía, se calcula
        try:
            subtotal = sum(float(p["cantidad"]) * float(p["precio"]) for p in productos)
            d["total"] = (subtotal + float(d.get("impuesto") or 0)
                          - float(d.get("descuento") or 0))
        except (TypeError, ValueError):
            return None, "No se pudo calcular el total: revisa 'cantidad' y 'precio'."
    d.setdefault("numero_factura", "-")
    d.setdefault("cliente", "Consumidor final")
    return d, None


@app.post("/imprimir")
def imprimir():
    """
    Ejemplo de JSON:
    {
      "empresa": "Mi Tienda C.A.", "rif": "J-12345678-9", "telefono": "0414-0000000",
      "numero_factura": "000123", "cliente": "Juan Pérez", "fecha": "14/10/2026 10:30",
      "productos": [{"cantidad": 2, "nombre": "Harina de maíz 1kg", "precio": 1.5}],
      "subtotal": 3.0, "impuesto": 0.48, "total": 3.48, "moneda": "$",
      "metodo_pago": "Efectivo", "pie": "¡Gracias por su compra!"
    }
    """
    ticket, error = validar_ticket(request.get_json(silent=True))
    if error:
        return jsonify(ok=False, error=error), 400

    cfg = cargar_config()
    mac = cfg.get("mac")
    if not mac:
        return jsonify(ok=False, error="No hay impresora configurada. Usa POST /configurar."), 409

    try:
        imagen = maquetar_ticket(ticket)
        comandos = imagen_a_escpos(imagen)
        ble.imprimir(mac, comandos, cfg.get("caracteristica_uuid"))
    except Exception as e:  # noqa: BLE001
        log.exception("Error al imprimir")
        return jsonify(ok=False, error=str(e)), 502
    return jsonify(ok=True, mensaje="Ticket enviado a la impresora.",
                   factura=ticket["numero_factura"], bytes=len(comandos))


@app.post("/configurar")
def configurar():
    """Body: {"mac": "AA:BB:CC:DD:EE:FF", "caracteristica_uuid": "(opcional)"}"""
    datos = request.get_json(silent=True) or {}
    mac = str(datos.get("mac", "")).strip()
    if not RE_MAC.match(mac):
        return jsonify(ok=False, error="MAC inválida. Formato esperado: AA:BB:CC:DD:EE:FF"), 400
    cfg = cargar_config()
    cfg["mac"] = normalizar_mac(mac)
    if datos.get("caracteristica_uuid"):
        cfg["caracteristica_uuid"] = str(datos["caracteristica_uuid"]).lower()
    else:
        cfg.pop("caracteristica_uuid", None)
    guardar_config(cfg)
    log.info("Impresora configurada: %s", cfg["mac"])
    return jsonify(ok=True, mac=cfg["mac"])


@app.get("/status")
def status():
    """?probar=1 intenta una conexión real con la impresora (tarda unos segundos)."""
    cfg = cargar_config()
    mac = cfg.get("mac")
    resp = {
        "ok": True,
        "servicio": "activo",
        "mac": mac,
        "configurada": bool(mac),
        "ultimo_estado_ble": ble.ultimo_estado,
        "ultimo_error": ble.ultimo_error,
        "ultima_impresion": ble.ultima_impresion,
    }
    if mac and request.args.get("probar") in ("1", "true", "si"):
        try:
            resp["prueba"] = ble.probar(mac, cfg.get("caracteristica_uuid"))
            resp["conectada"] = True
        except Exception as e:  # noqa: BLE001
            resp["conectada"] = False
            resp["error_conexion"] = str(e)
    return jsonify(resp)


@app.get("/escanear")
def escanear():
    """Extra: lista dispositivos BLE cercanos (enciende la impresora y no la tengas con el celular)."""
    try:
        return jsonify(ok=True, dispositivos=ble.escanear(float(request.args.get("segundos", 6))))
    except Exception as e:  # noqa: BLE001
        return jsonify(ok=False, error=str(e)), 500


@app.post("/vista-previa")
def vista_previa():
    """Extra: devuelve el ticket como PNG para depurar el diseño sin gastar papel."""
    ticket, error = validar_ticket(request.get_json(silent=True))
    if error:
        return jsonify(ok=False, error=error), 400
    buf = io.BytesIO()
    maquetar_ticket(ticket).save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")


# --------------------------------------------------------------------------- #
# 7. Arranque
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    log.info("Servicio de impresión iniciado en http://127.0.0.1:5000")
    # Solo escucha en localhost: no queda expuesto a la red.
    app.run(host="127.0.0.1", port=5000, threaded=True, debug=False, use_reloader=False)
