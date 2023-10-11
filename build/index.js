"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const soundcraft_ui_connection_1 = require("soundcraft-ui-connection");
const conn = new soundcraft_ui_connection_1.SoundcraftUI("10.0.1.2");
conn.connect();
//console.log(conn);
//conn.disconnect(); // close connection
//conn.reconnect(); // close connection and reconnect after timeout
console.log('Started');
function muteToggle(x) {
    conn.muteGroup(x).toggle();
}
function handleButtonEvent(buttonNumber) {
    return (err, value) => {
        if (!err)
            muteToggle(buttonNumber);
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
const pushButtonPins = [5, 6, 7, 8];
const LED = ledPinNumbers.map((pin) => new Gpio(pin, 'out'));
const pushButtons = pushButtonPins.map((pin) => new Gpio(pin, 'in', 'rising', { debounceTimeout: 75 }));
const [LED1, LED2, LED3, LED4] = LED;
const [pushButton1, pushButton2, pushButton3, pushButton4] = pushButtons;
const buttons = [pushButton1, pushButton2, pushButton3, pushButton4];
const leds = [LED1, LED2, LED3, LED4];
buttons.forEach((button, index) => button.watch(handleButtonEvent(index + 1)));
leds.forEach((led, index) => subscribeAndControlLED(index + 1, led));
function unexportOnClose() {
    LED1.writeSync(0); // Turn LED off
    LED1.unexport(); // Unexport LED GPIO to free resources
    pushButton1.unexport(); // Unexport Button GPIO to free resources
}
;
process.on('SIGINT', unexportOnClose); //function to run when user closes using ctrl+c
