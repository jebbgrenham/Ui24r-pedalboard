"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const soundcraft_ui_connection_1 = require("soundcraft-ui-connection");
const conn = new soundcraft_ui_connection_1.SoundcraftUI("10.0.1.2");
conn.connect();
console.log('Started');
var mode = "mutesA";
function stopButtonListeners() {
    buttons.forEach((button) => button.unwatchAll());
}
function handleButtonEvent(buttonNumber) {
    return (err, value) => {
        if (!err)
            conn.muteGroup(buttonNumber).toggle();
        console.log('buttonhandle', buttonNumber);
    };
}
function handleSamplerEvent(buttonNumber) {
    return (err, value) => {
        if (!err)
            console.log('sample play'); //conn.muteGroup(buttonNumber).toggle()
    };
}
function subscribeAndControlLED(//make the LEDs read mutegroup states
muteGroupNumber, LED) {
    conn.muteGroup(muteGroupNumber).state$.subscribe((state) => {
        LED.writeSync(state);
        //    console.log(`LED${muteGroupNumber} set to:`, LED.readSync())
    });
}
const Gpio = require('onoff').Gpio;
const ledPinNumbers = [9, 10, 11, 12];
const pushButtonPins = [5, 6, 7, 8,];
const modeButton = new Gpio(4, 'in', 'rising', { debounceTimeout: 75 });
const LED = ledPinNumbers.map((pin) => new Gpio(pin, 'out'));
const pushButtons = pushButtonPins.map((pin) => new Gpio(pin, 'in', 'rising', { debounceTimeout: 75 }));
const [LED1, LED2, LED3, LED4] = LED;
const [pushButton1, pushButton2, pushButton3, pushButton4] = pushButtons;
const buttons = [pushButton1, pushButton2, pushButton3, pushButton4];
const leds = [LED1, LED2, LED3, LED4];
modeButton.watch((err, value) => {
    if (err) {
        throw err;
    }
    if (value === 1) {
        stopButtonListeners();
        if (mode === "mutesA") {
            mode = "mutesB";
        }
        else if (mode === "mutesB") {
            mode = "sampler";
        }
        else if (mode === "sampler") {
            mode = "mutesA";
        }
        console.log(mode, '\n');
        if (mode === "mutesA") {
            buttons.forEach((button, index) => button.watch(handleButtonEvent(index + 1)));
            leds.forEach((led, index) => subscribeAndControlLED(index + 1, led));
        }
        else if (mode === "mutesB") {
            buttons.forEach((button, index) => button.watch(handleButtonEvent(index + 5)));
        }
        else if (mode === "sampler") {
            buttons.forEach((button, index) => button.watch(handleSamplerEvent(index + 1)));
        }
    }
});
function unexportOnClose() {
    leds.forEach((led) => {
        led.writeSync(0);
        led.unexport();
    });
    pushButtons.forEach((button) => {
        button.unexport();
    });
}
process.on('SIGINT', unexportOnClose); //function to run when user closes using ctrl+c
