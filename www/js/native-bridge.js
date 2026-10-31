(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // node_modules/@capacitor/core/dist/index.js
  var ExceptionCode, CapacitorException, getPlatformId, createCapacitor, initCapacitorGlobal, Capacitor, registerPlugin, WebPlugin, encode, decode, CapacitorCookiesPluginWeb, CapacitorCookies, readBlobAsBase64, normalizeHttpHeaders, buildUrlParams, buildRequestInit, CapacitorHttpPluginWeb, CapacitorHttp, SystemBarsStyle, SystemBarType, SystemBarsPluginWeb, SystemBars;
  var init_dist = __esm({
    "node_modules/@capacitor/core/dist/index.js"() {
      (function(ExceptionCode2) {
        ExceptionCode2["Unimplemented"] = "UNIMPLEMENTED";
        ExceptionCode2["Unavailable"] = "UNAVAILABLE";
      })(ExceptionCode || (ExceptionCode = {}));
      CapacitorException = class extends Error {
        constructor(message, code, data) {
          super(message);
          this.message = message;
          this.code = code;
          this.data = data;
        }
      };
      getPlatformId = (win) => {
        var _a, _b;
        if (win === null || win === void 0 ? void 0 : win.androidBridge) {
          return "android";
        } else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
          return "ios";
        } else {
          return "web";
        }
      };
      createCapacitor = (win) => {
        const capCustomPlatform = win.CapacitorCustomPlatform || null;
        const cap = win.Capacitor || {};
        const Plugins = cap.Plugins = cap.Plugins || {};
        const getPlatform = () => {
          return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
        };
        const isNativePlatform = () => getPlatform() !== "web";
        const isPluginAvailable = (pluginName) => {
          const plugin = registeredPlugins.get(pluginName);
          if (plugin === null || plugin === void 0 ? void 0 : plugin.platforms.has(getPlatform())) {
            return true;
          }
          if (getPluginHeader(pluginName)) {
            return true;
          }
          return false;
        };
        const getPluginHeader = (pluginName) => {
          var _a;
          return (_a = cap.PluginHeaders) === null || _a === void 0 ? void 0 : _a.find((h) => h.name === pluginName);
        };
        const handleError = (err) => win.console.error(err);
        const registeredPlugins = /* @__PURE__ */ new Map();
        const registerPlugin2 = (pluginName, jsImplementations = {}) => {
          const registeredPlugin = registeredPlugins.get(pluginName);
          if (registeredPlugin) {
            console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
            return registeredPlugin.proxy;
          }
          const platform = getPlatform();
          const pluginHeader = getPluginHeader(pluginName);
          let jsImplementation;
          const loadPluginImplementation = async () => {
            if (!jsImplementation && platform in jsImplementations) {
              jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
            } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
              jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
            }
            return jsImplementation;
          };
          const createPluginMethod = (impl, prop) => {
            var _a, _b;
            if (pluginHeader) {
              const methodHeader = pluginHeader === null || pluginHeader === void 0 ? void 0 : pluginHeader.methods.find((m) => prop === m.name);
              if (methodHeader) {
                if (methodHeader.rtype === "promise") {
                  return (options) => cap.nativePromise(pluginName, prop.toString(), options);
                } else {
                  return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
                }
              } else if (impl) {
                return (_a = impl[prop]) === null || _a === void 0 ? void 0 : _a.bind(impl);
              }
            } else if (impl) {
              return (_b = impl[prop]) === null || _b === void 0 ? void 0 : _b.bind(impl);
            } else {
              throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, ExceptionCode.Unimplemented);
            }
          };
          const createPluginMethodWrapper = (prop) => {
            let remove;
            const wrapper = (...args) => {
              const p = loadPluginImplementation().then((impl) => {
                const fn = createPluginMethod(impl, prop);
                if (fn) {
                  const p2 = fn(...args);
                  remove = p2 === null || p2 === void 0 ? void 0 : p2.remove;
                  return p2;
                } else {
                  throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, ExceptionCode.Unimplemented);
                }
              });
              if (prop === "addListener") {
                p.remove = async () => remove();
              }
              return p;
            };
            wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
            Object.defineProperty(wrapper, "name", {
              value: prop,
              writable: false,
              configurable: false
            });
            return wrapper;
          };
          const addListener = createPluginMethodWrapper("addListener");
          const removeListener = createPluginMethodWrapper("removeListener");
          const addListenerNative = (eventName, callback) => {
            const call = addListener({ eventName }, callback);
            const remove = async () => {
              const callbackId = await call;
              removeListener({
                eventName,
                callbackId
              }, callback);
            };
            const p = new Promise((resolve2) => call.then(() => resolve2({ remove })));
            p.remove = async () => {
              console.warn(`Using addListener() without 'await' is deprecated.`);
              await remove();
            };
            return p;
          };
          const proxy = new Proxy({}, {
            get(_, prop) {
              switch (prop) {
                // https://github.com/facebook/react/issues/20030
                case "$$typeof":
                  return void 0;
                case "toJSON":
                  return () => ({});
                case "addListener":
                  return pluginHeader ? addListenerNative : addListener;
                case "removeListener":
                  return removeListener;
                default:
                  return createPluginMethodWrapper(prop);
              }
            }
          });
          Plugins[pluginName] = proxy;
          registeredPlugins.set(pluginName, {
            name: pluginName,
            proxy,
            platforms: /* @__PURE__ */ new Set([...Object.keys(jsImplementations), ...pluginHeader ? [platform] : []])
          });
          return proxy;
        };
        if (!cap.convertFileSrc) {
          cap.convertFileSrc = (filePath) => filePath;
        }
        cap.getPlatform = getPlatform;
        cap.handleError = handleError;
        cap.isNativePlatform = isNativePlatform;
        cap.isPluginAvailable = isPluginAvailable;
        cap.registerPlugin = registerPlugin2;
        cap.Exception = CapacitorException;
        cap.DEBUG = !!cap.DEBUG;
        cap.isLoggingEnabled = !!cap.isLoggingEnabled;
        return cap;
      };
      initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win);
      Capacitor = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
      registerPlugin = Capacitor.registerPlugin;
      WebPlugin = class {
        constructor() {
          this.listeners = {};
          this.retainedEventArguments = {};
          this.windowListeners = {};
        }
        addListener(eventName, listenerFunc) {
          let firstListener = false;
          const listeners = this.listeners[eventName];
          if (!listeners) {
            this.listeners[eventName] = [];
            firstListener = true;
          }
          this.listeners[eventName].push(listenerFunc);
          const windowListener = this.windowListeners[eventName];
          if (windowListener && !windowListener.registered) {
            this.addWindowListener(windowListener);
          }
          if (firstListener) {
            this.sendRetainedArgumentsForEvent(eventName);
          }
          const remove = async () => this.removeListener(eventName, listenerFunc);
          const p = Promise.resolve({ remove });
          return p;
        }
        async removeAllListeners() {
          this.listeners = {};
          for (const listener in this.windowListeners) {
            this.removeWindowListener(this.windowListeners[listener]);
          }
          this.windowListeners = {};
        }
        notifyListeners(eventName, data, retainUntilConsumed) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            if (retainUntilConsumed) {
              let args = this.retainedEventArguments[eventName];
              if (!args) {
                args = [];
              }
              args.push(data);
              this.retainedEventArguments[eventName] = args;
            }
            return;
          }
          listeners.forEach((listener) => listener(data));
        }
        hasListeners(eventName) {
          var _a;
          return !!((_a = this.listeners[eventName]) === null || _a === void 0 ? void 0 : _a.length);
        }
        registerWindowListener(windowEventName, pluginEventName) {
          this.windowListeners[pluginEventName] = {
            registered: false,
            windowEventName,
            pluginEventName,
            handler: (event) => {
              this.notifyListeners(pluginEventName, event);
            }
          };
        }
        unimplemented(msg = "not implemented") {
          return new Capacitor.Exception(msg, ExceptionCode.Unimplemented);
        }
        unavailable(msg = "not available") {
          return new Capacitor.Exception(msg, ExceptionCode.Unavailable);
        }
        async removeListener(eventName, listenerFunc) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            return;
          }
          const index = listeners.indexOf(listenerFunc);
          if (index !== -1) {
            this.listeners[eventName].splice(index, 1);
          }
          if (!this.listeners[eventName].length) {
            this.removeWindowListener(this.windowListeners[eventName]);
          }
        }
        addWindowListener(handle) {
          window.addEventListener(handle.windowEventName, handle.handler);
          handle.registered = true;
        }
        removeWindowListener(handle) {
          if (!handle) {
            return;
          }
          window.removeEventListener(handle.windowEventName, handle.handler);
          handle.registered = false;
        }
        sendRetainedArgumentsForEvent(eventName) {
          const args = this.retainedEventArguments[eventName];
          if (!args) {
            return;
          }
          delete this.retainedEventArguments[eventName];
          args.forEach((arg) => {
            this.notifyListeners(eventName, arg);
          });
        }
      };
      encode = (str) => encodeURIComponent(str).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape);
      decode = (str) => str.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);
      CapacitorCookiesPluginWeb = class extends WebPlugin {
        async getCookies() {
          const cookies = document.cookie;
          const cookieMap = {};
          cookies.split(";").forEach((cookie) => {
            if (cookie.length <= 0)
              return;
            let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
            key = decode(key).trim();
            value = decode(value).trim();
            cookieMap[key] = value;
          });
          return cookieMap;
        }
        async setCookie(options) {
          try {
            const encodedKey = encode(options.key);
            const encodedValue = encode(options.value);
            const expires = options.expires ? `; expires=${options.expires.replace("expires=", "")}` : "";
            const path = (options.path || "/").replace("path=", "");
            const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
            document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async deleteCookie(options) {
          try {
            document.cookie = `${options.key}=; Max-Age=0`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearCookies() {
          try {
            const cookies = document.cookie.split(";") || [];
            for (const cookie of cookies) {
              document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
            }
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearAllCookies() {
          try {
            await this.clearCookies();
          } catch (error) {
            return Promise.reject(error);
          }
        }
      };
      CapacitorCookies = registerPlugin("CapacitorCookies", {
        web: () => new CapacitorCookiesPluginWeb()
      });
      readBlobAsBase64 = async (blob) => new Promise((resolve2, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = reader.result;
          resolve2(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(blob);
      });
      normalizeHttpHeaders = (headers = {}) => {
        const originalKeys = Object.keys(headers);
        const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase());
        const normalized = loweredKeys.reduce((acc, key, index) => {
          acc[key] = headers[originalKeys[index]];
          return acc;
        }, {});
        return normalized;
      };
      buildUrlParams = (params, shouldEncode = true) => {
        if (!params)
          return null;
        const output = Object.entries(params).reduce((accumulator, entry) => {
          const [key, value] = entry;
          let encodedValue;
          let item;
          if (Array.isArray(value)) {
            item = "";
            value.forEach((str) => {
              encodedValue = shouldEncode ? encodeURIComponent(str) : str;
              item += `${key}=${encodedValue}&`;
            });
            item.slice(0, -1);
          } else {
            encodedValue = shouldEncode ? encodeURIComponent(value) : value;
            item = `${key}=${encodedValue}`;
          }
          return `${accumulator}&${item}`;
        }, "");
        return output.substr(1);
      };
      buildRequestInit = (options, extra = {}) => {
        const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
        const headers = normalizeHttpHeaders(options.headers);
        const type = headers["content-type"] || "";
        if (typeof options.data === "string") {
          output.body = options.data;
        } else if (type.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(options.data || {})) {
            params.set(key, value);
          }
          output.body = params.toString();
        } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
          const form = new FormData();
          if (options.data instanceof FormData) {
            options.data.forEach((value, key) => {
              form.append(key, value);
            });
          } else {
            for (const key of Object.keys(options.data)) {
              form.append(key, options.data[key]);
            }
          }
          output.body = form;
          const headers2 = new Headers(output.headers);
          headers2.delete("content-type");
          output.headers = headers2;
        } else if (type.includes("application/json") || typeof options.data === "object") {
          output.body = JSON.stringify(options.data);
        }
        return output;
      };
      CapacitorHttpPluginWeb = class extends WebPlugin {
        /**
         * Perform an Http request given a set of options
         * @param options Options to build the HTTP request
         */
        async request(options) {
          const requestInit = buildRequestInit(options, options.webFetchExtra);
          const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
          const url = urlParams ? `${options.url}?${urlParams}` : options.url;
          const response = await fetch(url, requestInit);
          const contentType = response.headers.get("content-type") || "";
          let { responseType = "text" } = response.ok ? options : {};
          if (contentType.includes("application/json")) {
            responseType = "json";
          }
          let data;
          let blob;
          switch (responseType) {
            case "arraybuffer":
            case "blob":
              blob = await response.blob();
              data = await readBlobAsBase64(blob);
              break;
            case "json":
              data = await response.json();
              break;
            case "document":
            case "text":
            default:
              data = await response.text();
          }
          const headers = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });
          return {
            data,
            headers,
            status: response.status,
            url: response.url
          };
        }
        /**
         * Perform an Http GET request given a set of options
         * @param options Options to build the HTTP request
         */
        async get(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
        }
        /**
         * Perform an Http POST request given a set of options
         * @param options Options to build the HTTP request
         */
        async post(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
        }
        /**
         * Perform an Http PUT request given a set of options
         * @param options Options to build the HTTP request
         */
        async put(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
        }
        /**
         * Perform an Http PATCH request given a set of options
         * @param options Options to build the HTTP request
         */
        async patch(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
        }
        /**
         * Perform an Http DELETE request given a set of options
         * @param options Options to build the HTTP request
         */
        async delete(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
        }
      };
      CapacitorHttp = registerPlugin("CapacitorHttp", {
        web: () => new CapacitorHttpPluginWeb()
      });
      (function(SystemBarsStyle2) {
        SystemBarsStyle2["Dark"] = "DARK";
        SystemBarsStyle2["Light"] = "LIGHT";
        SystemBarsStyle2["Default"] = "DEFAULT";
      })(SystemBarsStyle || (SystemBarsStyle = {}));
      (function(SystemBarType2) {
        SystemBarType2["StatusBar"] = "StatusBar";
        SystemBarType2["NavigationBar"] = "NavigationBar";
      })(SystemBarType || (SystemBarType = {}));
      SystemBarsPluginWeb = class extends WebPlugin {
        async setStyle() {
          this.unavailable("not available for web");
        }
        async setAnimation() {
          this.unavailable("not available for web");
        }
        async show() {
          this.unavailable("not available for web");
        }
        async hide() {
          this.unavailable("not available for web");
        }
      };
      SystemBars = registerPlugin("SystemBars", {
        web: () => new SystemBarsPluginWeb()
      });
    }
  });

  // node_modules/@capacitor/filesystem/dist/esm/definitions.js
  var Directory, Encoding;
  var init_definitions = __esm({
    "node_modules/@capacitor/filesystem/dist/esm/definitions.js"() {
      (function(Directory2) {
        Directory2["Documents"] = "DOCUMENTS";
        Directory2["Data"] = "DATA";
        Directory2["Library"] = "LIBRARY";
        Directory2["Cache"] = "CACHE";
        Directory2["External"] = "EXTERNAL";
        Directory2["ExternalStorage"] = "EXTERNAL_STORAGE";
        Directory2["ExternalCache"] = "EXTERNAL_CACHE";
        Directory2["LibraryNoCloud"] = "LIBRARY_NO_CLOUD";
        Directory2["Temporary"] = "TEMPORARY";
      })(Directory || (Directory = {}));
      (function(Encoding2) {
        Encoding2["UTF8"] = "utf8";
        Encoding2["ASCII"] = "ascii";
        Encoding2["UTF16"] = "utf16";
      })(Encoding || (Encoding = {}));
    }
  });

  // node_modules/@capacitor/filesystem/dist/esm/web.js
  var web_exports = {};
  __export(web_exports, {
    FilesystemWeb: () => FilesystemWeb
  });
  function resolve(path) {
    const posix = path.split("/").filter((item) => item !== ".");
    const newPosix = [];
    posix.forEach((item) => {
      if (item === ".." && newPosix.length > 0 && newPosix[newPosix.length - 1] !== "..") {
        newPosix.pop();
      } else {
        newPosix.push(item);
      }
    });
    return newPosix.join("/");
  }
  function isPathParent(parent, children) {
    parent = resolve(parent);
    children = resolve(children);
    const pathsA = parent.split("/");
    const pathsB = children.split("/");
    return parent !== children && pathsA.every((value, index) => value === pathsB[index]);
  }
  var FilesystemWeb;
  var init_web = __esm({
    "node_modules/@capacitor/filesystem/dist/esm/web.js"() {
      init_dist();
      init_definitions();
      FilesystemWeb = class _FilesystemWeb extends WebPlugin {
        constructor() {
          super(...arguments);
          this.DB_VERSION = 1;
          this.DB_NAME = "Disc";
          this._writeCmds = ["add", "put", "delete"];
          this.downloadFile = async (options) => {
            var _a, _b;
            const requestInit = buildRequestInit(options, options.webFetchExtra);
            const response = await fetch(options.url, requestInit);
            let blob;
            if (!options.progress)
              blob = await response.blob();
            else if (!(response === null || response === void 0 ? void 0 : response.body))
              blob = new Blob();
            else {
              const reader = response.body.getReader();
              let bytes = 0;
              const chunks = [];
              const contentType = response.headers.get("content-type");
              const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
              while (true) {
                const { done, value } = await reader.read();
                if (done)
                  break;
                chunks.push(value);
                bytes += (value === null || value === void 0 ? void 0 : value.length) || 0;
                const status = {
                  url: options.url,
                  bytes,
                  contentLength
                };
                this.notifyListeners("progress", status);
              }
              const allChunks = new Uint8Array(bytes);
              let position = 0;
              for (const chunk of chunks) {
                if (typeof chunk === "undefined")
                  continue;
                allChunks.set(chunk, position);
                position += chunk.length;
              }
              blob = new Blob([allChunks.buffer], { type: contentType || void 0 });
            }
            const result = await this.writeFile({
              path: options.path,
              directory: (_a = options.directory) !== null && _a !== void 0 ? _a : void 0,
              recursive: (_b = options.recursive) !== null && _b !== void 0 ? _b : false,
              data: blob
            });
            return { path: result.uri, blob };
          };
        }
        readFileInChunks(_options, _callback) {
          throw this.unavailable("Method not implemented.");
        }
        async initDb() {
          if (this._db !== void 0) {
            return this._db;
          }
          if (!("indexedDB" in window)) {
            throw this.unavailable("This browser doesn't support IndexedDB");
          }
          return new Promise((resolve2, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onupgradeneeded = _FilesystemWeb.doUpgrade;
            request.onsuccess = () => {
              this._db = request.result;
              resolve2(request.result);
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
              console.warn("db blocked");
            };
          });
        }
        static doUpgrade(event) {
          const eventTarget = event.target;
          const db = eventTarget.result;
          switch (event.oldVersion) {
            case 0:
            case 1:
            default: {
              if (db.objectStoreNames.contains("FileStorage")) {
                db.deleteObjectStore("FileStorage");
              }
              const store = db.createObjectStore("FileStorage", { keyPath: "path" });
              store.createIndex("by_folder", "folder");
            }
          }
        }
        async dbRequest(cmd, args) {
          const readFlag = this._writeCmds.indexOf(cmd) !== -1 ? "readwrite" : "readonly";
          return this.initDb().then((conn) => {
            return new Promise((resolve2, reject) => {
              const tx = conn.transaction(["FileStorage"], readFlag);
              const store = tx.objectStore("FileStorage");
              const req = store[cmd](...args);
              req.onsuccess = () => resolve2(req.result);
              req.onerror = () => reject(req.error);
            });
          });
        }
        async dbIndexRequest(indexName, cmd, args) {
          const readFlag = this._writeCmds.indexOf(cmd) !== -1 ? "readwrite" : "readonly";
          return this.initDb().then((conn) => {
            return new Promise((resolve2, reject) => {
              const tx = conn.transaction(["FileStorage"], readFlag);
              const store = tx.objectStore("FileStorage");
              const index = store.index(indexName);
              const req = index[cmd](...args);
              req.onsuccess = () => resolve2(req.result);
              req.onerror = () => reject(req.error);
            });
          });
        }
        getPath(directory, uriPath) {
          const cleanedUriPath = uriPath !== void 0 ? uriPath.replace(/^[/]+|[/]+$/g, "") : "";
          let fsPath = "";
          if (directory !== void 0)
            fsPath += "/" + directory;
          if (uriPath !== "")
            fsPath += "/" + cleanedUriPath;
          return fsPath;
        }
        async clear() {
          const conn = await this.initDb();
          const tx = conn.transaction(["FileStorage"], "readwrite");
          const store = tx.objectStore("FileStorage");
          store.clear();
        }
        /**
         * Read a file from disk
         * @param options options for the file read
         * @return a promise that resolves with the read file data result
         */
        async readFile(options) {
          const path = this.getPath(options.directory, options.path);
          const entry = await this.dbRequest("get", [path]);
          if (entry === void 0)
            throw Error("File does not exist.");
          return { data: entry.content ? entry.content : "" };
        }
        /**
         * Write a file to disk in the specified location on device
         * @param options options for the file write
         * @return a promise that resolves with the file write result
         */
        async writeFile(options) {
          const path = this.getPath(options.directory, options.path);
          let data = options.data;
          const encoding = options.encoding;
          const doRecursive = options.recursive;
          const occupiedEntry = await this.dbRequest("get", [path]);
          if (occupiedEntry && occupiedEntry.type === "directory")
            throw Error("The supplied path is a directory.");
          const parentPath = path.substr(0, path.lastIndexOf("/"));
          const parentEntry = await this.dbRequest("get", [parentPath]);
          if (parentEntry === void 0) {
            const subDirIndex = parentPath.indexOf("/", 1);
            if (subDirIndex !== -1) {
              const parentArgPath = parentPath.substr(subDirIndex);
              await this.mkdir({
                path: parentArgPath,
                directory: options.directory,
                recursive: doRecursive
              });
            }
          }
          if (!encoding && !(data instanceof Blob)) {
            data = data.indexOf(",") >= 0 ? data.split(",")[1] : data;
            if (!this.isBase64String(data))
              throw Error("The supplied data is not valid base64 content.");
          }
          const now = Date.now();
          const pathObj = {
            path,
            folder: parentPath,
            type: "file",
            size: data instanceof Blob ? data.size : data.length,
            ctime: now,
            mtime: now,
            content: data
          };
          await this.dbRequest("put", [pathObj]);
          return {
            uri: pathObj.path
          };
        }
        /**
         * Append to a file on disk in the specified location on device
         * @param options options for the file append
         * @return a promise that resolves with the file write result
         */
        async appendFile(options) {
          const path = this.getPath(options.directory, options.path);
          let data = options.data;
          const encoding = options.encoding;
          const parentPath = path.substr(0, path.lastIndexOf("/"));
          const now = Date.now();
          let ctime = now;
          const occupiedEntry = await this.dbRequest("get", [path]);
          if (occupiedEntry && occupiedEntry.type === "directory")
            throw Error("The supplied path is a directory.");
          const parentEntry = await this.dbRequest("get", [parentPath]);
          if (parentEntry === void 0) {
            const subDirIndex = parentPath.indexOf("/", 1);
            if (subDirIndex !== -1) {
              const parentArgPath = parentPath.substr(subDirIndex);
              await this.mkdir({
                path: parentArgPath,
                directory: options.directory,
                recursive: true
              });
            }
          }
          if (!encoding && !this.isBase64String(data))
            throw Error("The supplied data is not valid base64 content.");
          if (occupiedEntry !== void 0) {
            if (occupiedEntry.content instanceof Blob) {
              throw Error("The occupied entry contains a Blob object which cannot be appended to.");
            }
            if (occupiedEntry.content !== void 0 && !encoding) {
              data = btoa(atob(occupiedEntry.content) + atob(data));
            } else {
              data = occupiedEntry.content + data;
            }
            ctime = occupiedEntry.ctime;
          }
          const pathObj = {
            path,
            folder: parentPath,
            type: "file",
            size: data.length,
            ctime,
            mtime: now,
            content: data
          };
          await this.dbRequest("put", [pathObj]);
        }
        /**
         * Delete a file from disk
         * @param options options for the file delete
         * @return a promise that resolves with the deleted file data result
         */
        async deleteFile(options) {
          const path = this.getPath(options.directory, options.path);
          const entry = await this.dbRequest("get", [path]);
          if (entry === void 0)
            throw Error("File does not exist.");
          const entries = await this.dbIndexRequest("by_folder", "getAllKeys", [IDBKeyRange.only(path)]);
          if (entries.length !== 0)
            throw Error("Folder is not empty.");
          await this.dbRequest("delete", [path]);
        }
        /**
         * Create a directory.
         * @param options options for the mkdir
         * @return a promise that resolves with the mkdir result
         */
        async mkdir(options) {
          const path = this.getPath(options.directory, options.path);
          const doRecursive = options.recursive;
          const parentPath = path.substr(0, path.lastIndexOf("/"));
          const depth = (path.match(/\//g) || []).length;
          const parentEntry = await this.dbRequest("get", [parentPath]);
          const occupiedEntry = await this.dbRequest("get", [path]);
          if (depth === 1)
            throw Error("Cannot create Root directory");
          if (occupiedEntry !== void 0)
            throw Error("Current directory does already exist.");
          if (!doRecursive && depth !== 2 && parentEntry === void 0)
            throw Error("Parent directory must exist");
          if (doRecursive && depth !== 2 && parentEntry === void 0) {
            const parentArgPath = parentPath.substr(parentPath.indexOf("/", 1));
            await this.mkdir({
              path: parentArgPath,
              directory: options.directory,
              recursive: doRecursive
            });
          }
          const now = Date.now();
          const pathObj = {
            path,
            folder: parentPath,
            type: "directory",
            size: 0,
            ctime: now,
            mtime: now
          };
          await this.dbRequest("put", [pathObj]);
        }
        /**
         * Remove a directory
         * @param options the options for the directory remove
         */
        async rmdir(options) {
          const { path, directory, recursive } = options;
          const fullPath = this.getPath(directory, path);
          const entry = await this.dbRequest("get", [fullPath]);
          if (entry === void 0)
            throw Error("Folder does not exist.");
          if (entry.type !== "directory")
            throw Error("Requested path is not a directory");
          const readDirResult = await this.readdir({ path, directory });
          if (readDirResult.files.length !== 0 && !recursive)
            throw Error("Folder is not empty");
          for (const entry2 of readDirResult.files) {
            const entryPath = `${path}/${entry2.name}`;
            const entryObj = await this.stat({ path: entryPath, directory });
            if (entryObj.type === "file") {
              await this.deleteFile({ path: entryPath, directory });
            } else {
              await this.rmdir({ path: entryPath, directory, recursive });
            }
          }
          await this.dbRequest("delete", [fullPath]);
        }
        /**
         * Return a list of files from the directory (not recursive)
         * @param options the options for the readdir operation
         * @return a promise that resolves with the readdir directory listing result
         */
        async readdir(options) {
          const path = this.getPath(options.directory, options.path);
          const entry = await this.dbRequest("get", [path]);
          if (options.path !== "" && entry === void 0)
            throw Error("Folder does not exist.");
          const entries = await this.dbIndexRequest("by_folder", "getAllKeys", [IDBKeyRange.only(path)]);
          const files = await Promise.all(entries.map(async (e) => {
            let subEntry = await this.dbRequest("get", [e]);
            if (subEntry === void 0) {
              subEntry = await this.dbRequest("get", [e + "/"]);
            }
            return {
              name: e.substring(path.length + 1),
              type: subEntry.type,
              size: subEntry.size,
              ctime: subEntry.ctime,
              mtime: subEntry.mtime,
              uri: subEntry.path
            };
          }));
          return { files };
        }
        /**
         * Return full File URI for a path and directory
         * @param options the options for the stat operation
         * @return a promise that resolves with the file stat result
         */
        async getUri(options) {
          const path = this.getPath(options.directory, options.path);
          let entry = await this.dbRequest("get", [path]);
          if (entry === void 0) {
            entry = await this.dbRequest("get", [path + "/"]);
          }
          return {
            uri: (entry === null || entry === void 0 ? void 0 : entry.path) || path
          };
        }
        /**
         * Return data about a file
         * @param options the options for the stat operation
         * @return a promise that resolves with the file stat result
         */
        async stat(options) {
          const path = this.getPath(options.directory, options.path);
          let entry = await this.dbRequest("get", [path]);
          if (entry === void 0) {
            entry = await this.dbRequest("get", [path + "/"]);
          }
          if (entry === void 0)
            throw Error("Entry does not exist.");
          return {
            name: entry.path.substring(path.length + 1),
            type: entry.type,
            size: entry.size,
            ctime: entry.ctime,
            mtime: entry.mtime,
            uri: entry.path
          };
        }
        /**
         * Rename a file or directory
         * @param options the options for the rename operation
         * @return a promise that resolves with the rename result
         */
        async rename(options) {
          await this._copy(options, true);
          return;
        }
        /**
         * Copy a file or directory
         * @param options the options for the copy operation
         * @return a promise that resolves with the copy result
         */
        async copy(options) {
          return this._copy(options, false);
        }
        async requestPermissions() {
          return { publicStorage: "granted" };
        }
        async checkPermissions() {
          return { publicStorage: "granted" };
        }
        /**
         * Function that can perform a copy or a rename
         * @param options the options for the rename operation
         * @param doRename whether to perform a rename or copy operation
         * @return a promise that resolves with the result
         */
        async _copy(options, doRename = false) {
          let { toDirectory } = options;
          const { to, from, directory: fromDirectory } = options;
          if (!to || !from) {
            throw Error("Both to and from must be provided");
          }
          if (!toDirectory) {
            toDirectory = fromDirectory;
          }
          const fromPath = this.getPath(fromDirectory, from);
          const toPath = this.getPath(toDirectory, to);
          if (fromPath === toPath) {
            return {
              uri: toPath
            };
          }
          if (isPathParent(fromPath, toPath)) {
            throw Error("To path cannot contain the from path");
          }
          let toObj;
          try {
            toObj = await this.stat({
              path: to,
              directory: toDirectory
            });
          } catch (e) {
            const toPathComponents = to.split("/");
            toPathComponents.pop();
            const toPath2 = toPathComponents.join("/");
            if (toPathComponents.length > 0) {
              const toParentDirectory = await this.stat({
                path: toPath2,
                directory: toDirectory
              });
              if (toParentDirectory.type !== "directory") {
                throw new Error("Parent directory of the to path is a file");
              }
            }
          }
          if (toObj && toObj.type === "directory") {
            throw new Error("Cannot overwrite a directory with a file");
          }
          const fromObj = await this.stat({
            path: from,
            directory: fromDirectory
          });
          const updateTime = async (path, ctime2, mtime) => {
            const fullPath = this.getPath(toDirectory, path);
            const entry = await this.dbRequest("get", [fullPath]);
            entry.ctime = ctime2;
            entry.mtime = mtime;
            await this.dbRequest("put", [entry]);
          };
          const ctime = fromObj.ctime ? fromObj.ctime : Date.now();
          switch (fromObj.type) {
            // The "from" object is a file
            case "file": {
              const file = await this.readFile({
                path: from,
                directory: fromDirectory
              });
              if (doRename) {
                await this.deleteFile({
                  path: from,
                  directory: fromDirectory
                });
              }
              let encoding;
              if (!(file.data instanceof Blob) && !this.isBase64String(file.data)) {
                encoding = Encoding.UTF8;
              }
              const writeResult = await this.writeFile({
                path: to,
                directory: toDirectory,
                data: file.data,
                encoding
              });
              if (doRename) {
                await updateTime(to, ctime, fromObj.mtime);
              }
              return writeResult;
            }
            case "directory": {
              if (toObj) {
                throw Error("Cannot move a directory over an existing object");
              }
              try {
                await this.mkdir({
                  path: to,
                  directory: toDirectory,
                  recursive: false
                });
                if (doRename) {
                  await updateTime(to, ctime, fromObj.mtime);
                }
              } catch (e) {
              }
              const contents = (await this.readdir({
                path: from,
                directory: fromDirectory
              })).files;
              for (const filename of contents) {
                await this._copy({
                  from: `${from}/${filename.name}`,
                  to: `${to}/${filename.name}`,
                  directory: fromDirectory,
                  toDirectory
                }, doRename);
              }
              if (doRename) {
                await this.rmdir({
                  path: from,
                  directory: fromDirectory
                });
              }
            }
          }
          return {
            uri: toPath
          };
        }
        isBase64String(str) {
          try {
            return btoa(atob(str)) == str;
          } catch (err) {
            return false;
          }
        }
      };
      FilesystemWeb._debug = true;
    }
  });

  // node_modules/@capacitor/app/dist/esm/web.js
  var web_exports2 = {};
  __export(web_exports2, {
    AppWeb: () => AppWeb
  });
  var AppWeb;
  var init_web2 = __esm({
    "node_modules/@capacitor/app/dist/esm/web.js"() {
      init_dist();
      AppWeb = class extends WebPlugin {
        constructor() {
          super();
          this.handleVisibilityChange = () => {
            const data = {
              isActive: document.hidden !== true
            };
            this.notifyListeners("appStateChange", data);
            if (document.hidden) {
              this.notifyListeners("pause", null);
            } else {
              this.notifyListeners("resume", null);
            }
          };
          document.addEventListener("visibilitychange", this.handleVisibilityChange, false);
        }
        exitApp() {
          throw this.unimplemented("Not implemented on web.");
        }
        async getInfo() {
          throw this.unimplemented("Not implemented on web.");
        }
        async getLaunchUrl() {
          return { url: "" };
        }
        async getState() {
          return { isActive: document.hidden !== true };
        }
        async minimizeApp() {
          throw this.unimplemented("Not implemented on web.");
        }
        async toggleBackButtonHandler() {
          throw this.unimplemented("Not implemented on web.");
        }
        async getAppLanguage() {
          return {
            value: navigator.language.split("-")[0].toLowerCase()
          };
        }
      };
    }
  });

  // node_modules/@capacitor-mlkit/barcode-scanning/dist/esm/definitions.js
  var BarcodeFormat, BarcodeValueType, Resolution, LensFacing, GoogleBarcodeScannerModuleInstallState, AddressType, EmailFormatType, PhoneFormatType, WifiEncryptionType;
  var init_definitions2 = __esm({
    "node_modules/@capacitor-mlkit/barcode-scanning/dist/esm/definitions.js"() {
      (function(BarcodeFormat2) {
        BarcodeFormat2["Aztec"] = "AZTEC";
        BarcodeFormat2["Codabar"] = "CODABAR";
        BarcodeFormat2["Code39"] = "CODE_39";
        BarcodeFormat2["Code93"] = "CODE_93";
        BarcodeFormat2["Code128"] = "CODE_128";
        BarcodeFormat2["DataMatrix"] = "DATA_MATRIX";
        BarcodeFormat2["Ean8"] = "EAN_8";
        BarcodeFormat2["Ean13"] = "EAN_13";
        BarcodeFormat2["Itf"] = "ITF";
        BarcodeFormat2["Pdf417"] = "PDF_417";
        BarcodeFormat2["QrCode"] = "QR_CODE";
        BarcodeFormat2["UpcA"] = "UPC_A";
        BarcodeFormat2["UpcE"] = "UPC_E";
      })(BarcodeFormat || (BarcodeFormat = {}));
      (function(BarcodeValueType2) {
        BarcodeValueType2["CalendarEvent"] = "CALENDAR_EVENT";
        BarcodeValueType2["ContactInfo"] = "CONTACT_INFO";
        BarcodeValueType2["DriversLicense"] = "DRIVERS_LICENSE";
        BarcodeValueType2["Email"] = "EMAIL";
        BarcodeValueType2["Geo"] = "GEO";
        BarcodeValueType2["Isbn"] = "ISBN";
        BarcodeValueType2["Phone"] = "PHONE";
        BarcodeValueType2["Product"] = "PRODUCT";
        BarcodeValueType2["Sms"] = "SMS";
        BarcodeValueType2["Text"] = "TEXT";
        BarcodeValueType2["Url"] = "URL";
        BarcodeValueType2["Wifi"] = "WIFI";
        BarcodeValueType2["Unknown"] = "UNKNOWN";
      })(BarcodeValueType || (BarcodeValueType = {}));
      (function(Resolution2) {
        Resolution2[Resolution2["640x480"] = 0] = "640x480";
        Resolution2[Resolution2["1280x720"] = 1] = "1280x720";
        Resolution2[Resolution2["1920x1080"] = 2] = "1920x1080";
        Resolution2[Resolution2["3840x2160"] = 3] = "3840x2160";
      })(Resolution || (Resolution = {}));
      (function(LensFacing2) {
        LensFacing2["Front"] = "FRONT";
        LensFacing2["Back"] = "BACK";
      })(LensFacing || (LensFacing = {}));
      (function(GoogleBarcodeScannerModuleInstallState2) {
        GoogleBarcodeScannerModuleInstallState2[GoogleBarcodeScannerModuleInstallState2["UNKNOWN"] = 0] = "UNKNOWN";
        GoogleBarcodeScannerModuleInstallState2[GoogleBarcodeScannerModuleInstallState2["PENDING"] = 1] = "PENDING";
        GoogleBarcodeScannerModuleInstallState2[GoogleBarcodeScannerModuleInstallState2["DOWNLOADING"] = 2] = "DOWNLOADING";
        GoogleBarcodeScannerModuleInstallState2[GoogleBarcodeScannerModuleInstallState2["CANCELED"] = 3] = "CANCELED";
        GoogleBarcodeScannerModuleInstallState2[GoogleBarcodeScannerModuleInstallState2["COMPLETED"] = 4] = "COMPLETED";
        GoogleBarcodeScannerModuleInstallState2[GoogleBarcodeScannerModuleInstallState2["FAILED"] = 5] = "FAILED";
        GoogleBarcodeScannerModuleInstallState2[GoogleBarcodeScannerModuleInstallState2["INSTALLING"] = 6] = "INSTALLING";
        GoogleBarcodeScannerModuleInstallState2[GoogleBarcodeScannerModuleInstallState2["DOWNLOAD_PAUSED"] = 7] = "DOWNLOAD_PAUSED";
      })(GoogleBarcodeScannerModuleInstallState || (GoogleBarcodeScannerModuleInstallState = {}));
      (function(AddressType2) {
        AddressType2[AddressType2["HOME"] = 0] = "HOME";
        AddressType2[AddressType2["UNKNOWN"] = 1] = "UNKNOWN";
        AddressType2[AddressType2["WORK"] = 2] = "WORK";
      })(AddressType || (AddressType = {}));
      (function(EmailFormatType2) {
        EmailFormatType2[EmailFormatType2["HOME"] = 0] = "HOME";
        EmailFormatType2[EmailFormatType2["UNKNOWN"] = 1] = "UNKNOWN";
        EmailFormatType2[EmailFormatType2["WORK"] = 2] = "WORK";
      })(EmailFormatType || (EmailFormatType = {}));
      (function(PhoneFormatType2) {
        PhoneFormatType2[PhoneFormatType2["FAX"] = 0] = "FAX";
        PhoneFormatType2[PhoneFormatType2["HOME"] = 1] = "HOME";
        PhoneFormatType2[PhoneFormatType2["MOBILE"] = 2] = "MOBILE";
        PhoneFormatType2[PhoneFormatType2["UNKNOWN"] = 3] = "UNKNOWN";
        PhoneFormatType2[PhoneFormatType2["WORK"] = 4] = "WORK";
      })(PhoneFormatType || (PhoneFormatType = {}));
      (function(WifiEncryptionType2) {
        WifiEncryptionType2[WifiEncryptionType2["OPEN"] = 1] = "OPEN";
        WifiEncryptionType2[WifiEncryptionType2["WEP"] = 2] = "WEP";
        WifiEncryptionType2[WifiEncryptionType2["WPA"] = 3] = "WPA";
      })(WifiEncryptionType || (WifiEncryptionType = {}));
    }
  });

  // node_modules/@capacitor-mlkit/barcode-scanning/dist/esm/web.js
  var web_exports3 = {};
  __export(web_exports3, {
    BarcodeScannerWeb: () => BarcodeScannerWeb
  });
  var BarcodeScannerWeb;
  var init_web3 = __esm({
    "node_modules/@capacitor-mlkit/barcode-scanning/dist/esm/web.js"() {
      init_dist();
      init_definitions2();
      BarcodeScannerWeb = class extends WebPlugin {
        constructor() {
          super(...arguments);
          this._isSupported = "BarcodeDetector" in window;
          this.errorVideoElementMissing = "videoElement must be provided.";
          this.errorBlobMissing = "blob must be provided.";
          this.eventBarcodesScanned = "barcodesScanned";
        }
        async startScan(options) {
          if (!this._isSupported) {
            throw this.createUnavailableException();
          }
          if (!(options === null || options === void 0 ? void 0 : options.videoElement)) {
            throw new Error(this.errorVideoElementMissing);
          }
          this.videoElement = options.videoElement;
          this.stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: {
                ideal: (options === null || options === void 0 ? void 0 : options.lensFacing) === LensFacing.Front ? "user" : "environment"
              }
            },
            audio: false
          });
          options.videoElement.srcObject = this.stream;
          await options.videoElement.play();
          const barcodeDetector = new BarcodeDetector();
          this.intervalId = window.setInterval(async () => {
            if (!options.videoElement) {
              return;
            }
            const barcodes = await barcodeDetector.detect(options.videoElement);
            if (barcodes.length === 0) {
              return;
            } else {
              this.handleScannedBarcodes(barcodes);
            }
          }, 500);
        }
        async stopScan() {
          if (!this._isSupported) {
            throw this.createUnavailableException();
          }
          if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = void 0;
          }
          if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = void 0;
          }
          if (this.videoElement) {
            this.videoElement.srcObject = null;
            this.videoElement = void 0;
          }
        }
        async readBarcodesFromImage(options) {
          var _a;
          if (!this._isSupported) {
            throw this.createUnavailableException();
          }
          if (!options.blob) {
            throw new Error(this.errorBlobMissing);
          }
          const formats = (_a = options.formats) === null || _a === void 0 ? void 0 : _a.map((format) => format.toLowerCase());
          const barcodeDetector = new BarcodeDetector((formats === null || formats === void 0 ? void 0 : formats.length) ? { formats } : void 0);
          const imageBitmap = await createImageBitmap(options.blob);
          const detectedBarcodes = await barcodeDetector.detect(imageBitmap);
          return {
            barcodes: this.convertDetectedBarcodesToBarcodes(detectedBarcodes)
          };
        }
        async scan() {
          throw this.createUnimplementedException();
        }
        async isSupported() {
          return { supported: this._isSupported };
        }
        async enableTorch() {
          throw this.createUnimplementedException();
        }
        async disableTorch() {
          throw this.createUnimplementedException();
        }
        async toggleTorch() {
          throw this.createUnimplementedException();
        }
        async isTorchEnabled() {
          throw this.createUnimplementedException();
        }
        async isTorchAvailable() {
          return { available: false };
        }
        async setZoomRatio(_options) {
          throw this.createUnimplementedException();
        }
        async getZoomRatio() {
          throw this.createUnimplementedException();
        }
        async getMinZoomRatio() {
          throw this.createUnimplementedException();
        }
        async getMaxZoomRatio() {
          throw this.createUnimplementedException();
        }
        async openSettings() {
          throw this.createUnimplementedException();
        }
        async isGoogleBarcodeScannerModuleAvailable() {
          throw this.createUnimplementedException();
        }
        async installGoogleBarcodeScannerModule() {
          throw this.createUnimplementedException();
        }
        async checkPermissions() {
          try {
            const result = await navigator.permissions.query({
              name: "camera"
            });
            return {
              camera: result.state
            };
          } catch (error) {
            return {
              camera: "prompt"
            };
          }
        }
        async requestPermissions() {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach((track) => track.stop());
            return {
              camera: "granted"
            };
          } catch (error) {
            return {
              camera: "denied"
            };
          }
        }
        createUnavailableException() {
          return new CapacitorException("This plugin method is not available on this platform.", ExceptionCode.Unavailable);
        }
        createUnimplementedException() {
          return new CapacitorException("This method is not implemented on web.", ExceptionCode.Unimplemented);
        }
        handleScannedBarcodes(barcodes) {
          const result = {
            barcodes: this.convertDetectedBarcodesToBarcodes(barcodes)
          };
          this.notifyListeners(this.eventBarcodesScanned, result);
        }
        convertDetectedBarcodesToBarcodes(barcodes) {
          return barcodes.map((barcode) => ({
            cornerPoints: [
              [barcode.cornerPoints[0].x, barcode.cornerPoints[0].y],
              [barcode.cornerPoints[1].x, barcode.cornerPoints[1].y],
              [barcode.cornerPoints[2].x, barcode.cornerPoints[2].y],
              [barcode.cornerPoints[3].x, barcode.cornerPoints[3].y]
            ],
            displayValue: barcode.rawValue,
            rawValue: barcode.rawValue,
            format: barcode.format.toUpperCase(),
            valueType: BarcodeValueType.Unknown
          }));
        }
      };
    }
  });

  // node_modules/@ascentio-it/capacitor-bluetooth-serial/dist/esm/utils/errors.js
  var OptionsRequiredError;
  var init_errors = __esm({
    "node_modules/@ascentio-it/capacitor-bluetooth-serial/dist/esm/utils/errors.js"() {
      OptionsRequiredError = class extends Error {
        constructor() {
          super("This method requires an options argument");
        }
      };
    }
  });

  // node_modules/@ascentio-it/capacitor-bluetooth-serial/dist/esm/web.js
  var web_exports4 = {};
  __export(web_exports4, {
    BluetoothSerial: () => BluetoothSerial,
    BluetoothSerialWeb: () => BluetoothSerialWeb
  });
  var BluetoothSerialWeb, BluetoothSerial;
  var init_web4 = __esm({
    "node_modules/@ascentio-it/capacitor-bluetooth-serial/dist/esm/web.js"() {
      init_dist();
      init_errors();
      BluetoothSerialWeb = class extends WebPlugin {
        async checkBluetoothPermissions() {
          throw this.unavailable("checkBluetoothPermissions is not available on web.");
        }
        async getPairedDevices() {
          throw this.unavailable("getPairedDevices is not available on web.");
        }
        async isEnabled() {
          return { enabled: true };
        }
        async canEnable() {
          return { enabled: false };
        }
        async enable() {
          throw this.unavailable("enable is not available on web.");
        }
        disable() {
          throw this.unavailable("disable is not available on web.");
        }
        startEnabledNotifications() {
          throw this.unavailable("disable is not available on web.");
        }
        stopEnabledNotifications() {
          throw this.unavailable("disable is not available on web.");
        }
        async scan() {
          throw new Error("Method not implemented.");
        }
        async connect(options) {
          if (!options) {
            return Promise.reject(new OptionsRequiredError());
          }
          throw new Error("Method not implemented.");
        }
        async connectInsecure(options) {
          if (!options) {
            return Promise.reject(new OptionsRequiredError());
          }
          throw new Error("Method not implemented.");
        }
        async disconnect(options) {
          if (!options) {
            return Promise.reject(new OptionsRequiredError());
          }
          throw new Error("Method not implemented.");
        }
        async isConnected(options) {
          if (!options) {
            return Promise.reject(new OptionsRequiredError());
          }
          throw new Error("Method not implemented.");
        }
        async read(options) {
          if (!options) {
            return Promise.reject(new OptionsRequiredError());
          }
          throw new Error("Method not implemented.");
        }
        async readUntil(options) {
          if (!options) {
            return Promise.reject(new OptionsRequiredError());
          }
          throw new Error("Method not implemented.");
        }
        async write(options) {
          if (!options) {
            return Promise.reject(new OptionsRequiredError());
          }
          throw new Error("Method not implemented.");
        }
        async startNotifications(options) {
          if (!options) {
            return Promise.reject(new OptionsRequiredError());
          }
          throw new Error("Method not implemented.");
        }
        async stopNotifications(options) {
          if (!options) {
            return Promise.reject(new OptionsRequiredError());
          }
          throw new Error("Method not implemented.");
        }
      };
      BluetoothSerial = new BluetoothSerialWeb();
    }
  });

  // node_modules/@capacitor/preferences/dist/esm/web.js
  var web_exports5 = {};
  __export(web_exports5, {
    PreferencesWeb: () => PreferencesWeb
  });
  var PreferencesWeb;
  var init_web5 = __esm({
    "node_modules/@capacitor/preferences/dist/esm/web.js"() {
      init_dist();
      PreferencesWeb = class extends WebPlugin {
        constructor() {
          super(...arguments);
          this.group = "CapacitorStorage";
        }
        async configure({ group }) {
          if (typeof group === "string") {
            this.group = group;
          }
        }
        async get(options) {
          const value = this.impl.getItem(this.applyPrefix(options.key));
          return { value };
        }
        async set(options) {
          this.impl.setItem(this.applyPrefix(options.key), options.value);
        }
        async remove(options) {
          this.impl.removeItem(this.applyPrefix(options.key));
        }
        async keys() {
          const keys = this.rawKeys().map((k) => k.substring(this.prefix.length));
          return { keys };
        }
        async clear() {
          for (const key of this.rawKeys()) {
            this.impl.removeItem(key);
          }
        }
        async migrate() {
          var _a;
          const migrated = [];
          const existing = [];
          const oldprefix = "_cap_";
          const keys = Object.keys(this.impl).filter((k) => k.indexOf(oldprefix) === 0);
          for (const oldkey of keys) {
            const key = oldkey.substring(oldprefix.length);
            const value = (_a = this.impl.getItem(oldkey)) !== null && _a !== void 0 ? _a : "";
            const { value: currentValue } = await this.get({ key });
            if (typeof currentValue === "string") {
              existing.push(key);
            } else {
              await this.set({ key, value });
              migrated.push(key);
            }
          }
          return { migrated, existing };
        }
        async removeOld() {
          const oldprefix = "_cap_";
          const keys = Object.keys(this.impl).filter((k) => k.indexOf(oldprefix) === 0);
          for (const oldkey of keys) {
            this.impl.removeItem(oldkey);
          }
        }
        get impl() {
          return window.localStorage;
        }
        get prefix() {
          return this.group === "NativeStorage" ? "" : `${this.group}.`;
        }
        rawKeys() {
          return Object.keys(this.impl).filter((k) => k.indexOf(this.prefix) === 0);
        }
        applyPrefix(key) {
          return this.prefix + key;
        }
      };
    }
  });

  // node_modules/@capacitor/filesystem/dist/esm/index.js
  init_dist();

  // node_modules/@capacitor/synapse/dist/synapse.mjs
  function s(t) {
    t.CapacitorUtils.Synapse = new Proxy(
      {},
      {
        get(e, n) {
          return new Proxy({}, {
            get(w, o) {
              return (c, p, r) => {
                const i = t.Capacitor.Plugins[n];
                if (i === void 0) {
                  r(new Error(`Capacitor plugin ${n} not found`));
                  return;
                }
                if (typeof i[o] != "function") {
                  r(new Error(`Method ${o} not found in Capacitor plugin ${n}`));
                  return;
                }
                (async () => {
                  try {
                    const a = await i[o](c);
                    p(a);
                  } catch (a) {
                    r(a);
                  }
                })();
              };
            }
          });
        }
      }
    );
  }
  function u(t) {
    t.CapacitorUtils.Synapse = new Proxy(
      {},
      {
        get(e, n) {
          return t.cordova.plugins[n];
        }
      }
    );
  }
  function f(t = false) {
    typeof window > "u" || (window.CapacitorUtils = window.CapacitorUtils || {}, window.Capacitor !== void 0 && !t ? s(window) : window.cordova !== void 0 && u(window));
  }

  // node_modules/@capacitor/filesystem/dist/esm/index.js
  init_definitions();
  var Filesystem = registerPlugin("Filesystem", {
    web: () => Promise.resolve().then(() => (init_web(), web_exports)).then((m) => new m.FilesystemWeb())
  });
  f();

  // node_modules/@capacitor/camera/dist/esm/index.js
  init_dist();

  // node_modules/@capacitor/camera/dist/esm/web.js
  init_dist();

  // node_modules/@capacitor/camera/dist/esm/definitions.js
  var CameraSource;
  (function(CameraSource2) {
    CameraSource2["Prompt"] = "PROMPT";
    CameraSource2["Camera"] = "CAMERA";
    CameraSource2["Photos"] = "PHOTOS";
  })(CameraSource || (CameraSource = {}));
  var CameraDirection;
  (function(CameraDirection2) {
    CameraDirection2["Rear"] = "REAR";
    CameraDirection2["Front"] = "FRONT";
  })(CameraDirection || (CameraDirection = {}));
  var CameraResultType;
  (function(CameraResultType2) {
    CameraResultType2["Uri"] = "uri";
    CameraResultType2["Base64"] = "base64";
    CameraResultType2["DataUrl"] = "dataUrl";
  })(CameraResultType || (CameraResultType = {}));
  var MediaType;
  (function(MediaType2) {
    MediaType2[MediaType2["Photo"] = 0] = "Photo";
    MediaType2[MediaType2["Video"] = 1] = "Video";
  })(MediaType || (MediaType = {}));
  var MediaTypeSelection;
  (function(MediaTypeSelection2) {
    MediaTypeSelection2[MediaTypeSelection2["Photo"] = 0] = "Photo";
    MediaTypeSelection2[MediaTypeSelection2["Video"] = 1] = "Video";
    MediaTypeSelection2[MediaTypeSelection2["All"] = 2] = "All";
  })(MediaTypeSelection || (MediaTypeSelection = {}));
  var EncodingType;
  (function(EncodingType2) {
    EncodingType2[EncodingType2["JPEG"] = 0] = "JPEG";
    EncodingType2[EncodingType2["PNG"] = 1] = "PNG";
  })(EncodingType || (EncodingType = {}));
  var CameraErrorCode;
  (function(CameraErrorCode2) {
    CameraErrorCode2["CameraPermissionDenied"] = "OS-PLUG-CAMR-0003";
    CameraErrorCode2["GalleryPermissionDenied"] = "OS-PLUG-CAMR-0005";
    CameraErrorCode2["NoCameraAvailable"] = "OS-PLUG-CAMR-0007";
    CameraErrorCode2["TakePhotoCancelled"] = "OS-PLUG-CAMR-0006";
    CameraErrorCode2["TakePhotoFailed"] = "OS-PLUG-CAMR-0010";
    CameraErrorCode2["TakePhotoInvalidArguments"] = "OS-PLUG-CAMR-0014";
    CameraErrorCode2["InvalidImageData"] = "OS-PLUG-CAMR-0008";
    CameraErrorCode2["EditPhotoFailed"] = "OS-PLUG-CAMR-0009";
    CameraErrorCode2["EditPhotoCancelled"] = "OS-PLUG-CAMR-0013";
    CameraErrorCode2["EditPhotoEmptyUri"] = "OS-PLUG-CAMR-0024";
    CameraErrorCode2["ImageNotFound"] = "OS-PLUG-CAMR-0011";
    CameraErrorCode2["ProcessImageFailed"] = "OS-PLUG-CAMR-0012";
    CameraErrorCode2["ChooseMediaFailed"] = "OS-PLUG-CAMR-0018";
    CameraErrorCode2["ChooseMediaCancelled"] = "OS-PLUG-CAMR-0020";
    CameraErrorCode2["MediaPathError"] = "OS-PLUG-CAMR-0021";
    CameraErrorCode2["FetchImageFromUriFailed"] = "OS-PLUG-CAMR-0028";
    CameraErrorCode2["RecordVideoFailed"] = "OS-PLUG-CAMR-0016";
    CameraErrorCode2["RecordVideoCancelled"] = "OS-PLUG-CAMR-0017";
    CameraErrorCode2["VideoNotFound"] = "OS-PLUG-CAMR-0025";
    CameraErrorCode2["PlayVideoFailed"] = "OS-PLUG-CAMR-0023";
    CameraErrorCode2["EncodeResultFailed"] = "OS-PLUG-CAMR-0019";
    CameraErrorCode2["FileNotFound"] = "OS-PLUG-CAMR-0027";
    CameraErrorCode2["InvalidArgument"] = "OS-PLUG-CAMR-0031";
    CameraErrorCode2["GeneralError"] = "OS-PLUG-CAMR-0026";
  })(CameraErrorCode || (CameraErrorCode = {}));

  // node_modules/@capacitor/camera/dist/esm/web.js
  var CameraWeb = class extends WebPlugin {
    async takePhoto(options) {
      return new Promise(async (resolve2, reject) => {
        if (options.webUseInput) {
          this.takePhotoCameraInputExperience(options, resolve2, reject);
        } else {
          this.takePhotoCameraExperience(options, resolve2, reject);
        }
      });
    }
    async recordVideo(_options) {
      throw this.unimplemented("recordVideo is not implemented on Web.");
    }
    async playVideo(_options) {
      throw this.unimplemented("playVideo is not implemented on Web.");
    }
    async chooseFromGallery(options) {
      return new Promise(async (resolve2, reject) => {
        this.galleryInputExperience(options, resolve2, reject);
      });
    }
    async editPhoto(_options) {
      throw this.unimplemented("editPhoto is not implemented on Web.");
    }
    async editURIPhoto(_options) {
      throw this.unimplemented("editURIPhoto is not implemented on Web.");
    }
    async getPhoto(options) {
      return new Promise(async (resolve2, reject) => {
        if (options.webUseInput || options.source === CameraSource.Photos) {
          this.fileInputExperience(options, resolve2, reject);
        } else if (options.source === CameraSource.Prompt) {
          let actionSheet = document.querySelector("pwa-action-sheet");
          if (!actionSheet) {
            actionSheet = document.createElement("pwa-action-sheet");
            document.body.appendChild(actionSheet);
          }
          actionSheet.header = options.promptLabelHeader || "Photo";
          actionSheet.cancelable = false;
          actionSheet.options = [
            { title: options.promptLabelPhoto || "From Photos" },
            { title: options.promptLabelPicture || "Take Picture" }
          ];
          actionSheet.addEventListener("onSelection", async (e) => {
            const selection = e.detail;
            if (selection === 0) {
              this.fileInputExperience(options, resolve2, reject);
            } else {
              this.cameraExperience(options, resolve2, reject);
            }
          });
        } else {
          this.cameraExperience(options, resolve2, reject);
        }
      });
    }
    async pickImages(_options) {
      return new Promise(async (resolve2, reject) => {
        this.multipleFileInputExperience(resolve2, reject);
      });
    }
    async cameraExperience(options, resolve2, reject) {
      await this._setupPWACameraModal(options.direction, (photo) => this._getCameraPhoto(photo, options), () => this.fileInputExperience(options, resolve2, reject), resolve2, reject);
    }
    fileInputExperience(options, resolve2, reject) {
      let input = document.querySelector("#_capacitor-camera-input");
      const cleanup = () => {
        var _a;
        (_a = input.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(input);
      };
      if (!input) {
        input = document.createElement("input");
        input.id = "_capacitor-camera-input";
        input.type = "file";
        input.hidden = true;
        document.body.appendChild(input);
        input.addEventListener("change", (_e) => {
          const file = input.files[0];
          let format = "jpeg";
          if (file.type === "image/png") {
            format = "png";
          } else if (file.type === "image/gif") {
            format = "gif";
          }
          if (options.resultType === "dataUrl" || options.resultType === "base64") {
            const reader = new FileReader();
            reader.addEventListener("load", () => {
              if (options.resultType === "dataUrl") {
                resolve2({
                  dataUrl: reader.result,
                  format
                });
              } else if (options.resultType === "base64") {
                const b64 = reader.result.split(",")[1];
                resolve2({
                  base64String: b64,
                  format
                });
              }
              cleanup();
            });
            reader.readAsDataURL(file);
          } else {
            resolve2({
              webPath: URL.createObjectURL(file),
              format
            });
            cleanup();
          }
        });
        input.addEventListener("cancel", (_e) => {
          reject(new CapacitorException("User cancelled photos app"));
          cleanup();
        });
      }
      input.accept = "image/*";
      input.capture = true;
      if (options.source === CameraSource.Photos || options.source === CameraSource.Prompt) {
        input.removeAttribute("capture");
      } else if (options.direction === CameraDirection.Front) {
        input.capture = "user";
      } else if (options.direction === CameraDirection.Rear) {
        input.capture = "environment";
      }
      input.click();
    }
    multipleFileInputExperience(resolve2, reject) {
      let input = document.querySelector("#_capacitor-camera-input-multiple");
      const cleanup = () => {
        var _a;
        (_a = input.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(input);
      };
      if (!input) {
        input = document.createElement("input");
        input.id = "_capacitor-camera-input-multiple";
        input.type = "file";
        input.hidden = true;
        input.multiple = true;
        document.body.appendChild(input);
        input.addEventListener("change", (_e) => {
          const photos = [];
          for (let i = 0; i < input.files.length; i++) {
            const file = input.files[i];
            let format = "jpeg";
            if (file.type === "image/png") {
              format = "png";
            } else if (file.type === "image/gif") {
              format = "gif";
            }
            photos.push({
              webPath: URL.createObjectURL(file),
              format
            });
          }
          resolve2({ photos });
          cleanup();
        });
        input.addEventListener("cancel", (_e) => {
          reject(new CapacitorException("User cancelled photos app"));
          cleanup();
        });
      }
      input.accept = "image/*";
      input.click();
    }
    _getCameraPhoto(photo, options) {
      return new Promise((resolve2, reject) => {
        const reader = new FileReader();
        const format = this._getFileFormat(photo);
        if (options.resultType === "uri") {
          resolve2({
            webPath: URL.createObjectURL(photo),
            format,
            saved: false
          });
        } else {
          reader.readAsDataURL(photo);
          reader.onloadend = () => {
            const r = reader.result;
            if (options.resultType === "dataUrl") {
              resolve2({
                dataUrl: r,
                format,
                saved: false
              });
            } else {
              resolve2({
                base64String: r.split(",")[1],
                format,
                saved: false
              });
            }
          };
          reader.onerror = (e) => {
            reject(e);
          };
        }
      });
    }
    async takePhotoCameraExperience(options, resolve2, reject) {
      await this._setupPWACameraModal(options.cameraDirection, (photo) => {
        var _a;
        return this._buildPhotoMediaResult(photo, (_a = options.includeMetadata) !== null && _a !== void 0 ? _a : false);
      }, () => this.takePhotoCameraInputExperience(options, resolve2, reject), resolve2, reject);
    }
    takePhotoCameraInputExperience(options, resolve2, reject) {
      const input = this._createFileInput("_capacitor-camera-input-takephoto");
      const cleanup = () => {
        var _a;
        (_a = input.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(input);
      };
      input.onchange = async (_e) => {
        var _a;
        if (!this._validateFileInput(input, reject, cleanup)) {
          return;
        }
        const file = input.files[0];
        resolve2(await this._buildPhotoMediaResult(file, (_a = options.includeMetadata) !== null && _a !== void 0 ? _a : false));
        cleanup();
      };
      input.oncancel = () => {
        reject(new CapacitorException("User cancelled photos app"));
        cleanup();
      };
      input.accept = "image/*";
      if (options.cameraDirection === CameraDirection.Front) {
        input.capture = "user";
      } else {
        input.capture = "environment";
      }
      input.click();
    }
    galleryInputExperience(options, resolve2, reject) {
      var _a, _b;
      const input = this._createFileInput("_capacitor-camera-input-gallery");
      input.multiple = (_a = options.allowMultipleSelection) !== null && _a !== void 0 ? _a : false;
      const cleanup = () => {
        var _a2;
        (_a2 = input.parentNode) === null || _a2 === void 0 ? void 0 : _a2.removeChild(input);
      };
      input.onchange = async (_e) => {
        var _a2;
        if (!this._validateFileInput(input, reject, cleanup)) {
          return;
        }
        const results = [];
        for (let i = 0; i < input.files.length; i++) {
          const file = input.files[i];
          if (file.type.startsWith("image/")) {
            results.push(await this._buildPhotoMediaResult(file, (_a2 = options.includeMetadata) !== null && _a2 !== void 0 ? _a2 : false));
          } else if (file.type.startsWith("video/")) {
            const format = this._getFileFormat(file);
            let thumbnail;
            let resolution;
            let duration;
            try {
              const videoInfo = await this._getVideoMetadata(file);
              thumbnail = videoInfo.thumbnail;
              if (options.includeMetadata) {
                resolution = videoInfo.resolution;
                duration = videoInfo.duration;
              }
            } catch (e) {
              console.warn("Failed to get video metadata:", e);
            }
            const result = {
              type: MediaType.Video,
              thumbnail,
              webPath: URL.createObjectURL(file),
              saved: false
            };
            if (options.includeMetadata) {
              result.metadata = {
                format,
                resolution,
                size: file.size,
                creationDate: new Date(file.lastModified).toISOString(),
                duration
              };
            }
            results.push(result);
          }
        }
        resolve2({ results });
        cleanup();
      };
      input.oncancel = () => {
        reject(new CapacitorException("User cancelled photos app"));
        cleanup();
      };
      const mediaType = (_b = options.mediaType) !== null && _b !== void 0 ? _b : MediaTypeSelection.Photo;
      if (mediaType === MediaTypeSelection.Photo) {
        input.accept = "image/*";
      } else if (mediaType === MediaTypeSelection.Video) {
        input.accept = "video/*";
      } else {
        input.accept = "image/*,video/*";
      }
      input.click();
    }
    _getFileFormat(file) {
      if (file.type === "image/png") {
        return "png";
      } else if (file.type === "image/gif") {
        return "gif";
      } else if (file.type.startsWith("video/")) {
        return file.type.split("/")[1];
      } else if (file.type.startsWith("image/")) {
        return "jpeg";
      }
      return file.type.split("/")[1] || "jpeg";
    }
    async _buildPhotoMediaResult(file, includeMetadata) {
      const format = this._getFileFormat(file);
      const thumbnail = await this._getBase64FromFile(file);
      const result = {
        type: MediaType.Photo,
        thumbnail,
        webPath: URL.createObjectURL(file),
        saved: false
      };
      if (includeMetadata) {
        const resolution = await this._getImageResolution(file);
        result.metadata = {
          format,
          resolution,
          size: file.size,
          creationDate: "lastModified" in file ? new Date(file.lastModified).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
        };
      }
      return result;
    }
    _validateFileInput(input, reject, cleanup) {
      if (!input.files || input.files.length === 0) {
        const message = input.multiple ? "No files selected" : "No file selected";
        reject(new CapacitorException(message));
        cleanup();
        return false;
      }
      return true;
    }
    async _setupPWACameraModal(cameraDirection, onPhotoCallback, fallbackCallback, resolve2, reject) {
      if (customElements.get("pwa-camera-modal")) {
        const cameraModal = document.createElement("pwa-camera-modal");
        cameraModal.facingMode = cameraDirection === CameraDirection.Front ? "user" : "environment";
        document.body.appendChild(cameraModal);
        try {
          await cameraModal.componentOnReady();
          cameraModal.addEventListener("onPhoto", async (e) => {
            const photo = e.detail;
            if (photo === null) {
              reject(new CapacitorException("User cancelled photos app"));
            } else if (photo instanceof Error) {
              reject(photo);
            } else {
              resolve2(await onPhotoCallback(photo));
            }
            cameraModal.dismiss();
            document.body.removeChild(cameraModal);
          });
          cameraModal.present();
        } catch (e) {
          fallbackCallback();
        }
      } else {
        console.error(`Unable to load PWA Element 'pwa-camera-modal'. See the docs: https://capacitorjs.com/docs/web/pwa-elements.`);
        fallbackCallback();
      }
    }
    _createFileInput(id) {
      let input = document.querySelector(`#${id}`);
      if (!input) {
        input = document.createElement("input");
        input.id = id;
        input.type = "file";
        input.hidden = true;
        document.body.appendChild(input);
      }
      return input;
    }
    async _getImageResolution(image) {
      try {
        const bitmap = await createImageBitmap(image);
        const resolution = `${bitmap.width}x${bitmap.height}`;
        bitmap.close();
        return resolution;
      } catch (e) {
        console.warn("Failed to get image resolution:", e);
        return void 0;
      }
    }
    _getBase64FromFile(file) {
      return new Promise((resolve2, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          const base64 = dataUrl.split(",")[1];
          resolve2(base64);
        };
        reader.onerror = (e) => {
          reject(e);
        };
        reader.readAsDataURL(file);
      });
    }
    _getVideoMetadata(videoFile) {
      return new Promise((resolve2) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.onloadedmetadata = () => {
          const seekTime = Math.min(1, video.duration * 0.1);
          video.currentTime = seekTime;
        };
        video.onseeked = () => {
          const result = {
            resolution: `${video.videoWidth}x${video.videoHeight}`,
            duration: video.duration
          };
          try {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              result.thumbnail = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
            }
          } catch (e) {
            console.warn("Failed to generate video thumbnail:", e);
          }
          URL.revokeObjectURL(video.src);
          resolve2(result);
        };
        video.onerror = () => {
          URL.revokeObjectURL(video.src);
          resolve2({});
        };
        video.src = URL.createObjectURL(videoFile);
      });
    }
    async checkPermissions() {
      if (typeof navigator === "undefined" || !navigator.permissions) {
        throw this.unavailable("Permissions API not available in this browser");
      }
      try {
        const permission = await window.navigator.permissions.query({
          name: "camera"
        });
        return {
          camera: permission.state,
          photos: "granted"
        };
      } catch (_a) {
        throw this.unavailable("Camera permissions are not available in this browser");
      }
    }
    async requestPermissions() {
      throw this.unimplemented("Not implemented on web.");
    }
    async pickLimitedLibraryPhotos() {
      throw this.unavailable("Not implemented on web.");
    }
    async getLimitedLibraryPhotos() {
      throw this.unavailable("Not implemented on web.");
    }
  };
  var Camera = new CameraWeb();

  // node_modules/@capacitor/camera/dist/esm/index.js
  var Camera2 = registerPlugin("Camera", {
    web: () => new CameraWeb()
  });

  // node_modules/@capacitor/app/dist/esm/index.js
  init_dist();
  var App = registerPlugin("App", {
    web: () => Promise.resolve().then(() => (init_web2(), web_exports2)).then((m) => new m.AppWeb())
  });

  // node_modules/@capacitor-mlkit/barcode-scanning/dist/esm/index.js
  init_dist();
  init_definitions2();
  var BarcodeScanner = registerPlugin("BarcodeScanner", {
    web: () => Promise.resolve().then(() => (init_web3(), web_exports3)).then((m) => new m.BarcodeScannerWeb())
  });

  // node_modules/@ascentio-it/capacitor-bluetooth-serial/dist/esm/index.js
  init_dist();
  var BluetoothSerial2 = registerPlugin("BluetoothSerial", {
    web: () => Promise.resolve().then(() => (init_web4(), web_exports4)).then((m) => new m.BluetoothSerialWeb())
  });

  // node_modules/@capacitor/preferences/dist/esm/index.js
  init_dist();
  var Preferences = registerPlugin("Preferences", {
    web: () => Promise.resolve().then(() => (init_web5(), web_exports5)).then((m) => new m.PreferencesWeb())
  });

  // native-src/bridge.js
  var ARCHIVO_DB = "facturak-datos.json";
  var MAPA_ACENTOS = { \u00E1: "a", \u00E9: "e", \u00ED: "i", \u00F3: "o", \u00FA: "u", \u00C1: "A", \u00C9: "E", \u00CD: "I", \u00D3: "O", \u00DA: "U", \u00F1: "n", \u00D1: "N", \u00FC: "u", \u00DC: "U", "\xBF": "", "\xA1": "" };
  function quitarAcentos(texto) {
    return String(texto || "").replace(/[áéíóúÁÉÍÓÚñÑüÜ¿¡]/g, (c) => MAPA_ACENTOS[c] ?? c);
  }
  var ESC = 27;
  var GS = 29;
  var LF = 10;
  var ANCHO_CARACTERES = 32;
  async function htmlAEscPos(html) {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:220px;height:10px;border:0";
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
    await new Promise((res) => {
      iframe.onload = res;
      setTimeout(res, 800);
    });
    const doc = iframe.contentDocument;
    const bytes = [];
    const push = (...b) => bytes.push(...b);
    const pushTexto = (t) => {
      for (const ch of quitarAcentos(t)) bytes.push(ch.charCodeAt(0) & 255);
    };
    function estiloDe(el) {
      const cs = doc.defaultView.getComputedStyle(el);
      return {
        align: cs.textAlign === "center" ? 1 : cs.textAlign === "right" ? 2 : 0,
        negrita: parseInt(cs.fontWeight, 10) >= 700,
        grande: parseFloat(cs.fontSize) >= 13,
        bloque: cs.display === "block"
      };
    }
    function aplicar(est) {
      push(ESC, 97, est.align);
      push(ESC, 69, est.negrita ? 1 : 0);
      push(GS, 33, est.grande ? 17 : 0);
    }
    function reset() {
      push(ESC, 97, 0);
      push(ESC, 69, 0);
      push(GS, 33, 0);
    }
    function recorrer(nodo) {
      for (const el of nodo.children) {
        if (el.tagName === "IMG" || el.tagName === "svg" || el.classList.contains("qr")) continue;
        if (el.classList.contains("hr")) {
          pushTexto("-".repeat(ANCHO_CARACTERES));
          push(LF);
          continue;
        }
        const spans = [...el.children].filter((c) => c.tagName === "SPAN");
        if (spans.length === 2) {
          const izq = spans[0].textContent.replace(/\s+/g, " ").trim();
          const der = spans[1].textContent.replace(/\s+/g, " ").trim();
          const estDer = estiloDe(spans[1]);
          if (estDer.bloque) {
            aplicar(estiloDe(spans[0]));
            pushTexto(izq);
            push(LF);
            aplicar(estDer);
            pushTexto(der);
            push(LF);
          } else {
            const relleno = Math.max(1, ANCHO_CARACTERES - izq.length - der.length);
            aplicar(estiloDe(spans[0]));
            pushTexto(izq);
            pushTexto(" ".repeat(relleno));
            aplicar(estDer);
            pushTexto(der);
            push(LF);
          }
          reset();
          continue;
        }
        const texto = el.textContent.replace(/\s+/g, " ").trim();
        if (texto) {
          aplicar(estiloDe(el));
          pushTexto(texto);
          push(LF);
          reset();
        } else recorrer(el);
      }
    }
    push(ESC, 64);
    recorrer(doc.body);
    push(LF, LF, LF);
    push(GS, 86, 1);
    iframe.remove();
    return bytes.map((b) => String.fromCharCode(b)).join("");
  }
  async function imprimirHTML({ html, deviceName }) {
    if (!deviceName) return { ok: false, motivo: "No hay una impresora Bluetooth configurada (ver pesta\xF1a Impresoras)." };
    try {
      const permisos = await BluetoothSerial2.checkBluetoothPermissions();
      if (!permisos) return { ok: false, motivo: "Faltan permisos de Bluetooth." };
      const estado = await BluetoothSerial2.isEnabled();
      if (!estado.enabled) await BluetoothSerial2.enable();
      await BluetoothSerial2.connect({ address: deviceName });
      const payload = await htmlAEscPos(html);
      await BluetoothSerial2.write({ address: deviceName, value: payload });
      await BluetoothSerial2.disconnect({ address: deviceName });
      return { ok: true, motivo: "" };
    } catch (err) {
      return { ok: false, motivo: err && err.message || "No se pudo imprimir por Bluetooth." };
    }
  }
  async function listarImpresoras() {
    try {
      const permisos = await BluetoothSerial2.checkBluetoothPermissions();
      if (!permisos) return [];
      const { devices } = await BluetoothSerial2.getPairedDevices();
      return devices.map((d) => ({ name: d.address, displayName: d.name || d.address, isDefault: false }));
    } catch (_) {
      return [];
    }
  }
  async function dbLoad() {
    try {
      const r = await Filesystem.readFile({ path: ARCHIVO_DB, directory: Directory.Data, encoding: Encoding.UTF8 });
      return r.data;
    } catch (_) {
      return null;
    }
  }
  async function dbSave(json) {
    await Filesystem.writeFile({ path: ARCHIVO_DB, directory: Directory.Data, encoding: Encoding.UTF8, data: json });
  }
  async function guardarPDF({ html }) {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:0;height:0;border:0";
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
    await new Promise((res) => {
      iframe.onload = res;
    });
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 4e3);
    return null;
  }
  async function tomarFoto() {
    const foto = await Camera2.getPhoto({ resultType: CameraResultType.DataUrl, source: CameraSource.Camera, quality: 70, width: 640 });
    return foto.dataUrl;
  }
  async function escanearCodigo() {
    const permiso = await BarcodeScanner.requestPermissions();
    if (permiso.camera !== "granted" && permiso.camera !== "limited") {
      return null;
    }
    const { barcodes } = await BarcodeScanner.scan();
    const primero = barcodes && barcodes[0];
    return primero ? primero.rawValue || primero.displayValue || "" : null;
  }
  async function exportarDatos(json) {
    const nombre = `FacturaK-respaldo-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    await Filesystem.writeFile({ path: nombre, directory: Directory.Documents, encoding: Encoding.UTF8, data: json });
    return nombre;
  }
  async function importarDatos() {
    return null;
  }
  var ultimoJSON = null;
  App.addListener("pause", () => {
    if (ultimoJSON) dbSave(ultimoJSON);
  });
  App.addListener("backButton", ({ canGoBack }) => {
    if (!canGoBack) App.exitApp();
  });
  function crearNube() {
    const CLAVE = "facturak-nube-config";
    let config = { baseUrl: "", token: "", empresaCodigo: "", empresaNombre: "", usuario: "", rol: "" };
    let productos = [];
    let temporizador = null;
    let cbProductos = () => {
    };
    let cbEstado = () => {
    };
    async function cargarConfig() {
      const r = await Preferences.get({ key: CLAVE });
      if (r.value) {
        try {
          config = JSON.parse(r.value);
        } catch (_) {
        }
      }
    }
    async function guardarConfig() {
      await Preferences.set({ key: CLAVE, value: JSON.stringify(config) });
    }
    function conectado() {
      return !!(config.baseUrl && config.token);
    }
    function estadoPublico() {
      return { conectado: conectado(), ...config, pendientes: 0 };
    }
    async function llamar(ruta, opciones = {}) {
      const base = config.baseUrl.replace(/\/+$/, "");
      const res = await fetch(base + ruta, {
        ...opciones,
        headers: { "Content-Type": "application/json", ...config.token ? { Authorization: "Bearer " + config.token } : {}, ...opciones.headers || {} }
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo && cuerpo.error || "Error del servidor (" + res.status + ")");
      return cuerpo;
    }
    async function login({ baseUrl, codigoEmpresa, usuario, password }) {
      const base = String(baseUrl || "").trim().replace(/\/+$/, "");
      if (!base) return { ok: false, error: "Ingresa la URL de tu FacturaK web." };
      try {
        const res = await fetch(base + "/api/desktop/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigoEmpresa, usuario, password }) });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || !data.ok) return { ok: false, error: data && data.error || "No se pudo iniciar sesi\xF3n." };
        config = { baseUrl: base, token: data.token, empresaCodigo: data.empresaCodigo, empresaNombre: data.empresaNombre, usuario, rol: data.rol };
        await guardarConfig();
        iniciarSondeo();
        return { ok: true, empresaNombre: data.empresaNombre, rol: data.rol };
      } catch (e) {
        return { ok: false, error: "No se pudo conectar con " + base + "." };
      }
    }
    async function logout() {
      detenerSondeo();
      config = { baseUrl: config.baseUrl, token: "", empresaCodigo: "", empresaNombre: "", usuario: "", rol: "" };
      await guardarConfig();
      return estadoPublico();
    }
    async function refrescarProductos() {
      if (!conectado()) return;
      try {
        const data = await llamar("/api/desktop/productos");
        productos = data.productos || [];
        cbEstado({ ...estadoPublico(), enLinea: true });
        cbProductos(productos);
      } catch (e) {
        cbEstado({ ...estadoPublico(), enLinea: false, error: String(e.message || e) });
      }
    }
    async function ajustarStock({ productoId, delta, tipo, nota }) {
      if (!conectado()) return { ok: false, error: "No has iniciado sesi\xF3n en la nube." };
      try {
        await llamar("/api/desktop/ajustar-stock", { method: "POST", body: JSON.stringify({ productoId, delta, tipo, nota: nota || null }) });
        refrescarProductos();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    }
    function iniciarSondeo() {
      if (temporizador) return;
      temporizador = setInterval(refrescarProductos, 4e3);
      refrescarProductos();
    }
    function detenerSondeo() {
      if (temporizador) {
        clearInterval(temporizador);
        temporizador = null;
      }
    }
    cargarConfig().then(() => {
      if (conectado()) iniciarSondeo();
    });
    return {
      estado: async () => estadoPublico(),
      login,
      logout,
      ajustarStock,
      productosListar: async () => productos,
      productosRefrescar: () => refrescarProductos(),
      onProductos: (cb) => {
        cbProductos = cb;
      },
      onEstado: (cb) => {
        cbEstado = cb;
      }
    };
  }
  async function guardarArchivoComo({ nombre, base64 }) {
    try {
      const seguro = String(nombre || "archivo").replace(/[^\w\-. ]+/g, "_");
      const r = await Filesystem.writeFile({ path: "FacturaK/" + seguro, directory: Directory.Documents, data: String(base64), recursive: true });
      return { ok: true, ruta: r.uri || "Documentos/FacturaK/" + seguro };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }
  window.api = {
    esEscritorio: true,
    dbEstadoCarga: async () => ({ recuperado: false, origen: "principal" }),
    guardarArchivoComo,
    mostrarArchivo: async () => true,
    plataforma: "android",
    dbLoad,
    dbSave: (json) => {
      ultimoJSON = json;
      return dbSave(json);
    },
    dbSaveSync: (json) => {
      ultimoJSON = json;
      return dbSave(json);
    },
    listarImpresoras,
    imprimirHTML,
    guardarPDF,
    enviarCorreo: async () => ({ ok: false, motivo: "El env\xEDo de correo desde Android no est\xE1 incluido en esta primera versi\xF3n." }),
    copiar: async (texto) => {
      try {
        await navigator.clipboard.writeText(texto);
        return true;
      } catch (_) {
        return false;
      }
    },
    abrirCarpetaDatos: async () => {
    },
    abrirCarpetaFacturas: async () => {
    },
    exportarDatos,
    importarDatos,
    tomarFoto,
    escanearCodigo,
    nube: crearNube()
  };
})();
/*! Bundled license information:

@capacitor/core/dist/index.js:
  (*! Capacitor: https://capacitorjs.com/ - MIT License *)
*/
