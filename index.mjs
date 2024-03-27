import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { HaritoraXWireless } from 'haritorax-interpreter';
import { SerialPort } from 'serialport';
import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sock = dgram.createSocket('udp4');
const dongle = new HaritoraXWireless();

const mainPath = app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : __dirname;

const jsonFilePath = path.join(mainPath, 'store.json');

let inMemoryStore = {};
updateData();
ipcMain.handle('get-data', async (event, key) => {
    updateData();
    return inMemoryStore[key];
});

ipcMain.on('set-data', (event, { key, value }) => {
    inMemoryStore[key] = value;
    saveToJSON();
});

ipcMain.on('delete-data', (event, key) => {
    delete inMemoryStore[key];
    saveToJSON();
});

ipcMain.handle('get-ports', async () => {
    const ports = await SerialPort.list();
    return ports.map(port => port.path);
});


ipcMain.handle('has-data', async (event, key) => {
    updateData();
    return inMemoryStore.hasOwnProperty(key);
});

const eventNames = ['imu', 'tracker', 'settings', 'button', 'battery', 'info'];
ipcMain.handle('call-dongle-function', (event, functionName, ...args) => {
    //console.log(`Calling function ${functionName} with args:`, args);
    if (typeof dongle[functionName] === 'function') {
        const result = dongle[functionName](...args);
        /*if (typeof result === 'object' && result !== null) {
            console.log(JSON.stringify(result));
        } else {
            console.log(result);
        }*/
        return result;
    }
});

eventNames.forEach(eventName => {
    dongle.on(eventName, (...eventData) => {
        mainWindow.webContents.send(`dongle-event-${eventName}`, ...eventData);
    });
});


function saveToJSON() {
    // Save the inMemoryStore to the JSON file
    const jsonData = JSON.stringify(inMemoryStore, null, 2);
    fs.writeFileSync(jsonFilePath, jsonData, 'utf8');
}
function updateData() {
    try {
        const data = fs.readFileSync(jsonFilePath, 'utf8');
        inMemoryStore = JSON.parse(data);
        //console.log(inMemoryStore);
    } catch (error) {
        // If the file doesn't exist or there is an error reading it, continue with an empty store
    }
}

var SLIME_IP = '0.0.0.0';
var SLIME_PORT = 6969;
let found = false;

var PACKET_COUNTER = 0;


sock.bind(9696, '0.0.0.0');

sock.on('message', (data, src) => {
    if (data.toString('utf-8').includes("Hey OVR =D")) {
        found = true;
        SLIME_IP = src.address;
        SLIME_PORT = src.port;
        console.log("Found SlimeVR at " + SLIME_IP + ":" + SLIME_PORT);
        PACKET_COUNTER += 1;
    }
});


function addIMU(trackerID) {
    return new Promise((resolve, reject) => {
        var buffer = new ArrayBuffer(128);
        var view = new DataView(buffer);
        view.setInt32(0, 15);                           // packet 15 header
        view.setBigInt64(4, BigInt(PACKET_COUNTER)); // packet counter
        view.setInt8(12, trackerID);       // tracker id (shown as IMU Tracker #x in SlimeVR)
        view.setInt8(13, 0);                            // sensor status
        view.setInt8(14, 0);                    // imu type
        var imuBuffer = new Uint8Array(buffer);

        sock.send(imuBuffer, SLIME_PORT, SLIME_IP, (err) => {
            if (err) {
                console.error('Error sending IMU packet:', err);
            } else {
                console.log(`Add IMU: ${trackerID}`);
                PACKET_COUNTER += 1;
                resolve();
            }
        });
    });
}

let isHandlingTracker = false;

// Create a queue of tracker names
const trackerQueue = [];

// Function to handle the next tracker name in the queue
async function handleNextTracker() {
    // If the queue is empty, do nothing
    if (trackerQueue.length === 0 || isHandlingTracker) return;

    isHandlingTracker = true;

    // Take the next tracker name from the queue
    const trackerName = trackerQueue.shift();

    console.log(`Connected to tracker: ${trackerName}`);
    if (connectedDevices.length == 0) {
        console.log("Adding IMU for device 0 // Handshake");
        const fw_string = "Haritora";

        function buildHandshake() {
            var buffer = new ArrayBuffer(128);
            var view = new DataView(buffer);
            var offset = 0;

            view.setInt32(offset, 3);                                   // packet 3 header
            offset += 4;
            view.setBigInt64(offset, BigInt(PACKET_COUNTER));         // packet counter
            offset += 8;
            view.setInt32(offset, 0);                        // Board type
            offset += 4;
            view.setInt32(offset, 0);                          // IMU type
            offset += 4;
            view.setInt32(offset, 0);                          // MCU type
            offset += 4;
            for (var i = 0; i < 3; i++) {
                view.setInt32(offset, 0);               // IMU info (unused)
                offset += 4;
            }
            view.setInt32(offset, 0);                       // Firmware build
            offset += 4;
            view.setInt8(offset, fw_string.length);               // Length of fw string
            offset += 1;
            for (var i = 0; i < fw_string.length; i++) {
                view.setInt8(offset, fw_string.charCodeAt(i));   // fw string
                offset += 1;
            }
            var macAddress = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06];
            for (var i = 0; i < macAddress.length; i++) {
                view.setInt8(offset, macAddress[i]); // MAC address
                offset += 1;
            }

            return new Uint8Array(buffer);
        }
        const handshake = buildHandshake();
        sock.send(handshake, 0, handshake.length, SLIME_PORT, SLIME_IP, (err) => {
            if (err) {
                console.error("Error sending handshake:", err);
            } else {
                console.log("Handshake sent successfully");
                PACKET_COUNTER += 1;
            }
        });

        connectedDevices.push(trackerName);
        connectedDevices.sort();
    } else {
        if (connectedDevices.includes(trackerName)) return;
        console.log(`Adding IMU for device ${connectedDevices.length}`)
        await addIMU(connectedDevices.length);
        connectedDevices.push(trackerName);
        connectedDevices.sort();
    }

    isHandlingTracker = false;

    // Handle the next tracker name in the queue
    handleNextTracker();
}

// When a 'connect' event is emitted, add the tracker name to the queue
dongle.on('connect', (trackerName) => {
    trackerQueue.push(trackerName);
    handleNextTracker();
    mainWindow.webContents.send('connect', trackerName);
});

dongle.on('disconnect', (trackerName) => {
    if (!connectedDevices.includes(trackerName)) return;
    console.log(`Disconnected from tracker: ${trackerName}`);
    mainWindow.webContents.send('disconnect', trackerName);
    connectedDevices = connectedDevices.filter(name => name !== trackerName);
});

let mainWindow;

let connectedDevices = [];


function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.js')
        },
    });
    mainWindow.loadFile('./tracker/index.html');
    try {
        setInterval(() => {
            if (mainWindow) {
                if (mainWindow.webContents) {
                    mainWindow.webContents.executeJavaScript(`
        document.activeElement.tagName.toUpperCase() !== 'INPUT' && document.activeElement.tagName.toUpperCase() !== 'TEXTAREA';
    `).then((result) => {
                        if (result) {
                            mainWindow.webContents.sendInputEvent({ type: 'mouseDown', x: 0, y: 0, button: 'left', clickCount: 1 });
                            mainWindow.webContents.sendInputEvent({ type: 'mouseUp', x: 0, y: 0, button: 'left', clickCount: 1 });
                        }
                    }).catch((error) => {
                        console.error(error);
                    });
                    // Get the position of the window
                    const windowPosition = mainWindow.getPosition();
                    const windowX = windowPosition[0];
                    const windowY = windowPosition[1];

                    // Get the size of the window
                    const windowSize = mainWindow.getSize();
                    const windowWidth = windowSize[0];
                    const windowHeight = windowSize[1];

                    // Calculate the coordinates relative to the window
                    const xRelative = screen.getCursorScreenPoint().x; // Adjust as needed
                    const yRelative = screen.getCursorScreenPoint().y; // Adjust as needed

                    const x = xRelative - windowX;
                    const y = yRelative - windowY - 50;
                    mainWindow.webContents.sendInputEvent(
                        { type: 'mouseMove', x: x, y: y });
                }
            }
        }, 1000);
    } catch (error) {
        console.error(error);
    }

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        mainWindow = null;
        dongle.stopConnection("gx6");
    });
}

app.on('ready', createWindow);


let lastTimestamp = Date.now();
let tpsCounter = 0;
ipcMain.on('sendData', async (event, postData) => {
    let deviceid = null;
    
    const nullKeys = Object.entries(postData)
        .filter(([key, value]) => key !== 'battery' && key !== 'voltage' && value === null)
        .map(([key, value]) => key);

    if (nullKeys.length > 0) {
        return console.error("The following postData keys have null values:", nullKeys);
    }

    deviceid = connectedDevices.indexOf(postData["deviceName"]);
    
    buildAccelAndSend(postData["acceleration"], deviceid);
    PACKET_COUNTER += 1;
    buildRotationAndSend(postData["rotation"], deviceid);
    PACKET_COUNTER += 1;
    if (deviceid == 0 && postData["battery"] !== null) {
        sendBatteryLevel(postData["battery"], deviceid);
        PACKET_COUNTER += 1;
    }
    const currentTimestamp = Date.now();
    const timeDifference = currentTimestamp - lastTimestamp;
    if (deviceid == 0) {
        if (timeDifference >= 1000) {
            const tps = tpsCounter / (timeDifference / 1000);
            console.log(`TPS: ${tps}`);
            tpsCounter = 0;
            lastTimestamp = currentTimestamp;
        } else {
            tpsCounter += 1;
        }
    }
});

// TODO: fix voltage, figure out how to send battery per tracker
function sendBatteryLevel(percentage, voltage, trackerid) {
    var buffer = new ArrayBuffer(20);
    var view = new DataView(buffer);
    view.setInt32(0, 12);
    view.setBigInt64(4, BigInt(PACKET_COUNTER));
    view.setFloat32(12, voltage / 100); // 0.0v-whateverv
    view.setFloat32(16, percentage / 100); // 0.0-1.0
    var sendBuffer = new Uint8Array(buffer);
    sock.send(sendBuffer, 0, sendBuffer.length, SLIME_PORT, SLIME_IP, (err) => {
        if (err) {
            console.error(`Error sending packet for sensor ${trackerId}:`, err);
        } else {

        }
    });
}


function buildAccelPacket(ax, ay, az, trackerID) {
    let buffer = new Uint8Array(128);
    let view = new DataView(buffer.buffer);

    view.setInt32(0, 4); // packet 4 header
    view.setBigInt64(4, BigInt(PACKET_COUNTER)); // packet counter
    view.setFloat32(12, ax);
    view.setFloat32(16, ay);
    view.setFloat32(20, az);
    view.setUint8(24, trackerID); // tracker id
    return buffer;
}





function buildAccelAndSend(acceleration, trackerId) {
    const ax = acceleration["x"];
    const ay = acceleration["y"];
    const az = acceleration["z"];
    const buffer = buildAccelPacket(ax, ay, az, trackerId);

    sock.send(buffer, 0, buffer.length, SLIME_PORT, SLIME_IP, (err) => {
        if (err) {
            console.error(`Error sending packet for sensor ${trackerId}:`, err);
        } else {

        }
    });
}

function buildRotationPacket(qx, qy, qz, qw, tracker_id) {
    let buffer = new Uint8Array(128);
    let view = new DataView(buffer.buffer);

    view.setInt32(0, 17);
    view.setBigInt64(4, BigInt(PACKET_COUNTER));
    view.setUint8(12, tracker_id);
    view.setUint8(13, 1);

    view.setFloat32(14, qx);
    view.setFloat32(18, qy);
    view.setFloat32(22, qz);
    view.setFloat32(26, qw);

    view.setUint8(30, 0);

    return buffer;
}



function buildRotationAndSend(rotation, trackerId) {
    const x = rotation["x"];
    const y = rotation["y"];
    const z = rotation["z"];
    const w = rotation["w"];
    const buffer = buildRotationPacket(x, y, z, w, trackerId);

    sock.send(buffer, 0, buffer.length, SLIME_PORT, SLIME_IP, (err) => {
        if (err) {
            console.error(`Error sending packet for sensor ${trackerId}:`, err);
        } else {

        }
    });
}



/*ipcMain.on('disconnect', (event) => {
    console.log("Removing all listeners");
    dongle.removeAllListeners();
});*/


// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});
