const { ipcRenderer } = require('electron');

function MagnetometerComponent() {
    function create(parentElement, id, checked) {
        // Create container div
        const container = document.createElement("div");

        // Create elements
        const p = document.createElement("p");
        p.textContent = "Magnetometer";
        p.style.display = "inline";

        const label = document.createElement("label");
        label.className = "switch";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = id;
        input.checked = checked;

        const span = document.createElement("span");
        span.className = "slider round";

        const br1 = document.createElement("br");
        const br2 = document.createElement("br");
        const br3 = document.createElement("br");

        // Append elements to container
        label.appendChild(input);
        label.appendChild(span);
        container.appendChild(p);
        container.appendChild(br1);
        container.appendChild(label);
        container.appendChild(br2);
        container.appendChild(br3);

        // Append container to parentElement
        parentElement.appendChild(container);

        return {
            delete: function () {
                deleteComponent(container);
            }
        };
    }

    function deleteComponent(container) {
        // Remove the container
        container.remove();
    }

    return {
        create: create
    };
}

correction_value_target = 0;

const store = {
    // Send a message to the main process to get data from the store
    get: async (key) => await window.ipc.invoke('get-data', key),

    set: (key, value) => window.ipc.send('set-data', { key, value }),

    delete: (key) => window.ipc.send('delete-data', key),

    has: async (key) => await window.ipc.invoke('has-data', key)
};


document.getElementById('accel').addEventListener('change', function() {
    store.set('accel', this.checked);
    updateTargetValue();
});

document.getElementById('mag').addEventListener('change', function() {
    store.set('mag', this.checked);
    updateTargetValue();
});

document.getElementById('gyro').addEventListener('change', function() {
    store.set('gyro', this.checked);
    updateTargetValue();
});

// Function to load saved checkbox values
async function loadCheckboxValues() {;
    const accel = await store.has("accel") ? await store.get('accel') : true;
    const mag = await store.get('mag');
    const gyro = await store.get('gyro');
    
    // Update checkbox states based on saved values
    document.getElementById('accel').checked = accel;
    document.getElementById('mag').checked = mag;
    document.getElementById('gyro').checked = gyro;

    updateTargetValue();
}

// Function to update the target value based on checkbox states
function updateTargetValue() {
    correction_value_target = 0;
    const accel = document.getElementById('accel').checked;
    const mag = document.getElementById('mag').checked;
    const gyro = document.getElementById('gyro').checked;
    if (accel) correction_value_target += 1;
    if (mag) correction_value_target += 4;
    if (gyro) correction_value_target += 2;
}

document.addEventListener("DOMContentLoaded", async function () {
    loadCheckboxValues();
    // Populate COM ports checkboxes
    const ports = await ipcRenderer.invoke('get-ports');
    const container = document.createElement('div');

    ports.forEach(port => {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = "com";
        checkbox.name = port;
        checkbox.value = port;
    
        checkbox.addEventListener('change', () => {
            const checkedCheckboxes = container.querySelectorAll('input[type=checkbox]:checked');
            const uncheckedCheckboxes = container.querySelectorAll('input[type=checkbox]:not(:checked)');
            if (checkedCheckboxes.length >= 3) {
                uncheckedCheckboxes.forEach(cb => cb.setAttribute('disabled', ''));
            } else {
                uncheckedCheckboxes.forEach(cb => cb.removeAttribute('disabled'));
            }
        });
    
        const label = document.createElement('label');
        label.htmlFor = port;
        label.appendChild(document.createTextNode(port));
    
        container.appendChild(document.createElement('br'));
        container.appendChild(checkbox);
        container.appendChild(label);
    });

    const portsElement = document.getElementById('ports');
    portsElement.appendChild(container);
});

function justNumbers(string) {
    var numsStr = string.replace(/[^0-9]/g, '');

    if (!numsStr) {
        return 100;
    }

    return parseInt(numsStr);
}

var allowconnection = true;
var connecting = null;
async function connectToTrackers() {
    const status = document.getElementById("status");
    status.innerHTML = "Status: Connecting to trackers...";
    if (connecting == null) {
        connecting = setInterval(async () => {
            if (allowconnection) {
                allowconnection = false;
                await connectToDevice();
            }
        }, 1000);
    }
}

async function disconnectAllDevices() {
    ipcRenderer.invoke("call-dongle-function", "stopConnection", "gx6");
    if (connecting) { 
        const status = document.getElementById("status");
        status.innerHTML = "Status: Not searching.";
        const devicelist = document.getElementById("devicelist");
        trackercount.innerHTML = "Connected Trackers: " + 0;
        devicelist.innerHTML = "<br><h1>Trackers: </h1><br></br>";
        ipc.send('connection', false);
        clearInterval(connecting);
    }
    for (const deviceId in trackerdevices) {
        const device = trackerdevices[deviceId][0];
        await disconnectDevice(device);
    }
    trackerdevices = {};
    allowconnection = true;
    connecting = null;
}

const trackercount = document.getElementById("trackercount");


function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end
}

function interpolateIMU(data, t) {
    if (t == 1) {
        return data;
    }

    const currentrot = new Quaternion(data["rotation"]);
    const interpolatedQuaternion = currentrot.slerp(currentrot)(t);
    const interpolatedData = {
        deviceName: data.deviceName,
        deviceId: data.deviceId,
        rotation: {
            x: interpolatedQuaternion.x,
            y: interpolatedQuaternion.y,
            z: interpolatedQuaternion.z,
            w: interpolatedQuaternion.w,
        },
        acceleration: {
            x: lerp(data.acceleration.x, data.acceleration.x, t),
            y: lerp(data.acceleration.y, data.acceleration.y, t),
            z: lerp(data.acceleration.z, data.acceleration.z, t),
        },
        battery: data.battery,
    };

    return interpolatedData;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
let trackers = null;
/**
 * Connects to the devices and initializes the data for each tracker.
 * @returns {Promise<void>} A promise that resolves when the connection is established and the data is initialized.
 */
async function connectToDevice() {
    const trackerData = {};
    
    const MINIMUM_DEVICES = 2;
    
    let activeTrackers = 0;

    const comPorts = Array.from(document.querySelectorAll('input[type=checkbox][id^="com"]:checked')).map(cb => cb.value);
    comPorts.sort();
    console.log('Connecting to ports:', comPorts);
    ipcRenderer.invoke('call-dongle-function', 'startConnection', 'gx6', comPorts);


    while (activeTrackers < MINIMUM_DEVICES) {
        console.log(`Waiting for at least ${MINIMUM_DEVICES} devices to connect. Connected devices: ${activeTrackers}`);
        const result = await ipcRenderer.invoke('call-dongle-function', 'getActiveTrackers');
        console.log('Received result from dongle:', result);
        if (Array.isArray(result) && result.length > 0) {
            activeTrackers = result.length;
            trackers = result;
        }
        await sleep(1000);
    }

    for (const deviceId in trackers) {
        const device = trackers[deviceId];

        console.log('Connected to device:', device);

        const devicelist = document.getElementById("devicelist");
        const deviceelement = document.createElement("div");

        deviceelement.id = device;
        devicelist.appendChild(deviceelement);

        trackers[device] = [device, null];
        battery[device] = 0;

        const magcompoonent = new MagnetometerComponent();
        magnetometerelement = magcompoonent.create(devicelist, "magnetometer" + device, false);

        let magnetometerCheckbox = document.getElementById("magnetometer" + device);
        if (await store.has(("magnetometer" + device))) {
            magnetometerCheckbox.checked = await store.get("magnetometer" + device);
        } else {
            magnetometerCheckbox.checked = false;
        }
        mag = magnetometerCheckbox.checked;
        magnetometerCheckbox.addEventListener("change", function () {
            store.set("magnetometer" + device, magnetometerCheckbox.checked);
            mag = magnetometerCheckbox.checked;
        });

        trackercount.innerHTML = "Connected Trackers: " + activeTrackers;

        // Initialize the data for this tracker
        trackerData[device] = {
            sensor_rotation: null,
            sensor_gravity: null,
            battery_value: null,
            battery_voltage: null
        };

        var postData = null;

        var tpsCounter = 0;
        var lastTimestamp = 0;
        const updateValues = async () => {
            console.log('updateValues was called');
            // Handle notifications

            ipcRenderer.on('dongle-event-imu', (event, trackerName, rotation, gravity, ankle) => {
                // Handle sensor data
                if (!trackerData[device]) {
                    trackerData[device] = {};
                }
                if (trackerName === device) {
                    //console.log(`Received IMU data for device ${device} aka ${trackerName}:`, rotation, gravity, ankle);
                    trackerData[device].sensor_rotation = rotation;
                    trackerData[device].sensor_gravity = gravity;
                }

                if (Date.now() - lastTimestamp >= 1000) {
                    const tps = tpsCounter / ((Date.now() - lastTimestamp) / 1000);
                    //console.log(`TPS: ${tps}`);
                    tpsCounter = 0;
                    lastTimestamp = Date.now();
                } else {
                    tpsCounter += 1;
                }
            });

            ipcRenderer.on('dongle-event-battery', (event, trackerName, batteryRemaining, batteryVoltage, chargeStatus) => {
                // Handle battery data
                if (!trackerData[device]) {
                    trackerData[device] = {};
                }
                if (trackerName === device) {
                    trackerData[device].battery_value = batteryRemaining;
                    trackerData[device].battery_voltage = batteryVoltage;
                    console.log(`Received battery data for device ${device} aka ${trackerName}:`, batteryRemaining, batteryVoltage, chargeStatus);
                }

                if (Date.now() - lastTimestamp >= 1000) {
                    const tps = tpsCounter / ((Date.now() - lastTimestamp) / 1000);
                    //console.log(`TPS: ${tps}`);
                    tpsCounter = 0;
                    lastTimestamp = Date.now();
                } else {
                    tpsCounter += 1;
                }

            });
        };

        // Start the update loop
        updateValues();

        // TODO allow user to change their settings, currently we keep FPS the same and ankle disabled
        const writeValues = async () => {
            console.log('writeValues was called');
            if (trackers[device] == null) return console.error(`${device} in trackers is null.`);
            try {
                const currentTrackerSettings = await ipcRenderer.invoke('call-dongle-function', 'getTrackerSettings', device);
                if (currentTrackerSettings) {
                    const { sensorMode, fpsMode, sensorAutoCorrection, ankleMotionDetection } = currentTrackerSettings;
                    console.log('Current settings for device:', currentTrackerSettings);
                    if (sensorMode === null || fpsMode === null || sensorAutoCorrection === null || ankleMotionDetection === null) return console.error('Invalid settings received from dongle:', currentTrackerSettings);

                    // Update the tracker settings
                    const newSensorMode = mag ? 1 : 2;
                    const newFpsMode = parseInt(fpsMode);
                    const newAnkleMotionDetection = false;
                    const newSensorAutoCorrection = [];
                    if (correction_value_target & 1) newSensorAutoCorrection.push('accel');
                    if (correction_value_target & 2) newSensorAutoCorrection.push('gyro');
                    if (correction_value_target & 4) newSensorAutoCorrection.push('mag');

                    ipcRenderer.invoke('call-dongle-function', 'setTrackerSettings', device, newSensorMode, newFpsMode, newSensorAutoCorrection, newAnkleMotionDetection);
                    last_target_value = correction_value_target;
                    console.log(`New settings for tracker ${device}: sensorMode: ${sensorMode}, fpsMode: ${fpsMode}, sensorAutoCorrection: ${sensorAutoCorrection}, ankleMotionDetection: ${ankleMotionDetection}`);
                } else {
                    console.error('Failed to get current settings for device:', device);
                }

                // what is this for? is this meant to set the settings every 100ms..?
                // can replace with some sort of event listener for when the settings change, or just.. don't do this and apply settings when changing the checkboxes
                // if (connecting) setTimeout(writeValues, 100);
            } catch (error) {
                console.log("Error while trying to write to GX6 trackers: ", error);
            }
        }

        writeValues();

        const trackercheck = setInterval(async () => {
            const { sensor_rotation, sensor_gravity, battery_value, battery_voltage } = trackerData[device];

            postData = {
                deviceName: device,
                deviceId: device,
                rotation: trackerData[device].sensor_rotation ? {
                    x: trackerData[device].sensor_rotation.x,
                    y: trackerData[device].sensor_rotation.y,
                    z: trackerData[device].sensor_rotation.z,
                    w: trackerData[device].sensor_rotation.w
                } : null,
                acceleration: trackerData[device].sensor_gravity ? {
                    x: trackerData[device].sensor_gravity.x,
                    y: trackerData[device].sensor_gravity.y,
                    z: trackerData[device].sensor_gravity.z
                } : null,
                battery: battery_value,
                voltage: battery_voltage
            };

            if (postData && sensor_rotation && sensor_gravity) {
                postDataCurrent = interpolateIMU(postData);
            }

            if (!postData.rotation || !postData.acceleration) {
                return console.log('Skipping frame due to missing data:', postData);
            }

            ipc.send('sendData', postData);

            // rotation is given in radians
            const rotation = new Quaternion([postData["rotation"].w, postData["rotation"].x, postData["rotation"].y, postData["rotation"].z]);
            const rotation_Euler_raw = rotation.toEuler("XYZ");

            // Convert radians to degrees
            const rotation_Euler = {
                x: rotation_Euler_raw[0] * (180 / Math.PI),
                y: rotation_Euler_raw[1] * (180 / Math.PI),
                z: rotation_Euler_raw[2] * (180 / Math.PI)
            };

            const deviceName = postData["deviceName"];
            const deviceId = postData["deviceId"];
            const { x: rotX, y: rotY, z: rotZ } = rotation_Euler;
            const { x: accelX, y: accelY, z: accelZ } = postData["acceleration"];
            const batteryPercentage = (battery[device] * 100);

            // Build the HTML content
            const content =
                "<strong>Device name:</strong> " + deviceName + "<br>" +
                "<strong>Device ID:</strong> " + deviceId + "<br>" +
                "<strong>Rotation:</strong> X: " + rotX.toFixed(0) + ", Y: " + rotY.toFixed(0) + ", Z: " + rotZ.toFixed(0) + "<br>" +
                "<strong>Acceleration:</strong> X: " + accelX.toFixed(0) + ", Y: " + accelY.toFixed(0) + ", Z: " + accelZ.toFixed(0) + "<br>" +
                "<strong>Battery:</strong> " + batteryPercentage.toFixed(0) + "% <br><br>";
            deviceelement.innerHTML = content;

        }, 10);
        trackers[device][1] = trackercheck;

        ipcRenderer.on('disconnect', (event, trackerName) => {
            if (trackerName === device) {
                //clearInterval(trackers[device][1]);
                deviceelement.remove();
                delete trackers[device];
                //delete battery[device];
                //delete trackerdevices[device];
                //delete trackerData[device];
                ipc.send("disconnect", device);
                Object.keys(trackers).forEach(key => {
                    if (!isNaN(key)) {
                        delete trackers[key];
                    }
                });
                trackercount.innerHTML = "Connected Trackers: " + parseInt(Object.values(trackers).length);
                console.log(`Device length: ${Object.values(trackers).length}`);
                console.log(`devices: ${Object.values(trackers)}`);
                console.log(`Removing device ${device} from trackers and removing elements.`);
                return;
            }
        });

        ipcRenderer.on('connect', (event, trackerName) => {
            trackercount.innerHTML = "Connected Trackers: " + parseInt((Object.values(trackers).length) + 1);
        });
    }
}


battery = {};
trackerdevices = {};

window.onbeforeunload = function (event) {
    ipc.send('connection', false);
    disconnectAllDevices();
};
