"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const soundcraft_ui_connection_1 = require("soundcraft-ui-connection");
const os = __importStar(require("os"));
const ui24rInterface = __importStar(require("./ui24rInterface"));
const child_process_1 = require("child_process");
const Gpio = require('onoff').Gpio;
//Prove we booted
var FourteenSegment = require('ht16k33-fourteensegment-display');
var display = new FourteenSegment(0x70, 1);
display.writeString("A.C.A.B");
const ping = require('ping');
let conn;
function scrollDisplay(inputString, inputShort) {
    const blockLength = 4;
    inputString = "    " + inputString + "   " + inputShort;
    for (let i = 0; i < inputString.length - blockLength + 1; i++) {
        const block = inputString.substring(i, i + blockLength);
        // Use setTimeout to wait 200ms between iterations
        setTimeout(() => {
            display.writeString(block);
        }, i * 200);
    }
}
// Function to get the subnet based on the device's IP on wlan0
function getSubnet() {
    var _a;
    const networkInterfaces = os.networkInterfaces();
    const wlan0Interface = networkInterfaces['wlan0'];
    if (wlan0Interface) {
        const ipAddress = (_a = wlan0Interface.find((info) => info.family === 'IPv4')) === null || _a === void 0 ? void 0 : _a.address;
        if (ipAddress) {
            // Assuming the subnet is in the format 'xxx.xxx.xxx'
            const subnet = ipAddress.split('.').slice(0, 3).join('.');
            return subnet;
        }
    }
    return null;
}
function discoverSoundcraftUI() {
    return __awaiter(this, void 0, void 0, function* () {
        const subnet = getSubnet();
        console.log("Subnet is ", subnet);
        if (subnet) {
            for (let attempt = 0; attempt < 5; attempt++) {
                const pingPromises = [];
                for (let i = 1; i <= 255; i++) {
                    const ip = `${subnet}.${i}`;
                    pingPromises.push(pingAndCheck(ip));
                }
                const results = yield Promise.all(pingPromises);
                display.writeString('SRCH');
                for (const result of results) {
                    if (result && result[1]) {
                        const connectedIP = yield attemptConnection(result[0]);
                        if (connectedIP) {
                            return connectedIP;
                        }
                    }
                }
            }
        }
        return null; // No reachable device found after 5 attempts
    });
}
function pingAndCheck(ip) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield ping.promise.probe(ip);
            return [ip, result.alive];
        }
        catch (error) {
            return null;
        }
    });
}
function attemptConnection(ip) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            conn = new soundcraft_ui_connection_1.SoundcraftUI(ip);
            // Subscribe to status changes
            const statusSubscription = conn.status$.subscribe(status => {
                //console.log('Connection status:', status);
                if (status.type === 'OPEN') {
                    // Connection successful, complete the Promise
                    console.log('Ah excellent! Here is a mixer I can talk to');
                    scrollDisplay('SUCCESS @ ' + ip, 'SUCC.');
                    statusSubscription.unsubscribe();
                    resolve(ip);
                }
                else if (status.type === 'ERROR') {
                    // Connection error, move on to the next IP
                    console.log('Nope,', ip, 'is not a mixer :\(');
                    statusSubscription.unsubscribe();
                    resolve(null);
                }
            });
            try {
                // Connect and wait for the operation to finish
                conn.connect().then(() => {
                    // Handle cases where 'OPEN' status is not reached
                    console.error(`Connection to ${ip} did not reach 'OPEN' status.`);
                    resolve(null);
                });
            }
            catch (error) {
                // Handle connection errors
                console.error(`Connection to ${ip} failed:`, error);
                resolve(null);
            }
        });
    });
}
function initializeSoundcraftUIConnection() {
    return __awaiter(this, void 0, void 0, function* () {
        const discoveredIP = yield discoverSoundcraftUI();
        if (!discoveredIP) {
            console.error('No SoundcraftUI device found on the network.');
            scrollDisplay('NO MIXER ON NETWORK', 'NoMX');
            return false;
        }
        conn = new soundcraft_ui_connection_1.SoundcraftUI(discoveredIP);
        try {
            yield conn.connect();
            console.log('Connected to SoundcraftUI at:', discoveredIP);
            ui24rInterface.mainInterface(conn, display);
            return true;
        }
        catch (error) {
            console.error(`Connection to ${discoveredIP} failed:`, error);
            return false;
        }
    });
}
// Initialize shutdown button 
const shutdownButton = new Gpio(8, 'in', 'both', { debounceTimeout: 75 });
let isShutdownButtonPressed = false;
let shutdownTimeout = null;
function handleShutdown() {
    console.log('Shutting down...');
    executeShutdownCommand();
}
shutdownButton.watch((err, value) => {
    if (err) {
        throw err;
    }
    if (value === 0) {
        isShutdownButtonPressed = true;
        shutdownTimeout = setTimeout(() => {
            if (isShutdownButtonPressed) {
                display.writeString('BYE.{');
                handleShutdown();
            }
            shutdownTimeout = null;
        }, 3000);
    }
    else if (value === 1) {
        isShutdownButtonPressed = false;
        if (shutdownTimeout) {
            clearTimeout(shutdownTimeout);
            shutdownTimeout = null;
        }
    }
});
function executeShutdownCommand() {
    (0, child_process_1.exec)('sudo shutdown -h now', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error during shutdown: ${error}`);
        }
        else {
            console.log('Shutdown initiated successfully.');
        }
    });
}
initializeSoundcraftUIConnection();
process.on('SIGINT', () => {
    display.writeString('BYE.{');
    console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
    process.exit(0);
});
