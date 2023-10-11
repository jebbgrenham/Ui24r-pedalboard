import { SoundcraftUI } from 'soundcraft-ui-connection'
import { filter } from 'rxjs/operators'
const conn = new SoundcraftUI("10.0.1.2")
conn.connect()
//console.log(conn);
//conn.disconnect(); // close connection
//conn.reconnect(); // close connection and reconnect after timeout
console.log('Started')

function muteToggle(x:number) {
  conn.muteGroup(x).toggle()
}

function handleButtonEvent(buttonNumber: number) {// Handle button events
  return function (err: string, value: string) {
    if (err) {
      console.error('There was an error', err);
      return;
    }
    muteToggle(buttonNumber);
  };
}

function subscribeAndControlLED( //make the LEDs read mutegroup states
  muteGroupNumber: number,
  LED: { writeSync: (state: number) => void, readSync: () => number }
): void {
  conn.muteGroup(muteGroupNumber).state$.subscribe((state) => {
    LED.writeSync(state)
//    console.log(`LED${muteGroupNumber} set to:`, LED.readSync())
  });
}


var Gpio = require('onoff').Gpio; //set up all the variables for the GPIO pins
const ledPinNumbers = [9, 10, 11, 12];
const pushButtonPins = [5, 6, 7, 8];
const LED = ledPinNumbers.map((pin) => new Gpio(pin, 'out'));
const pushButtons = pushButtonPins.map(
  (pin) => new Gpio(pin, 'in', 'rising', { debounceTimeout: 75 })
);
const [LED1, LED2, LED3, LED4] = LED;
const [pushButton1, pushButton2, pushButton3, pushButton4] = pushButtons;

// Watch buttons using the handleButtonEvent function
pushButton1.watch(handleButtonEvent(1));
pushButton2.watch(handleButtonEvent(2));
pushButton3.watch(handleButtonEvent(3));
pushButton4.watch(handleButtonEvent(4));
// update the LEDs constantly
subscribeAndControlLED(1, LED1);
subscribeAndControlLED(2, LED2);
subscribeAndControlLED(3, LED3);
subscribeAndControlLED(4, LED4);

function unexportOnClose() { //function to run when exiting program
  LED1.writeSync(0); // Turn LED off
  LED1.unexport(); // Unexport LED GPIO to free resources
  pushButton1.unexport(); // Unexport Button GPIO to free resources
};

process.on('SIGINT', unexportOnClose); //function to run when user closes using ctrl+c
