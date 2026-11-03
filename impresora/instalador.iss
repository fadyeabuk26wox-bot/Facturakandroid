[Setup]
AppName=FacturaK Servicio de Impresora
AppVersion=1.0
DefaultDirName={localappdata}\FacturaK Impresora
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
OutputDir=instalador
OutputBaseFilename=Instalar_FacturaK_Impresora
Compression=lzma2
SolidCompression=yes

[Files]
Source: "dist\ServicioImpresoraFacturaK.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userstartup}\FacturaK Impresora"; Filename: "{app}\ServicioImpresoraFacturaK.exe"

[Run]
Filename: "{app}\ServicioImpresoraFacturaK.exe"; Description: "Iniciar el servicio ahora"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/F /IM ServicioImpresoraFacturaK.exe"; Flags: runhidden; RunOnceId: "MatarServicio"
