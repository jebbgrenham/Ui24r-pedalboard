import { SoundcraftUI } from 'soundcraft-ui-connection';
import { filter } from 'rxjs/operators';

const conn = new SoundcraftUI("10.0.1.2");
conn.connect();
//console.log(conn);
//conn.disconnect(); // close connection
//conn.reconnect(); // close connection and reconnect after timeout

console.log('Started');

function muteToggle(x:number) {
  conn.muteGroup(x).toggle()  
  conn.muteGroup(x).state$.subscribe((state) => {
  });
}

var Gpio = require('onoff').Gpio; //include onoff to interact with the GPIO
var LED = new Gpio(9, 'out'); //use GPIO pin 9 as output
var pushButton = new Gpio(5, 'in', 'rising', {debounceTimeout: 75}); //use GPIO pin 17 as input, and 'both' button presses, and releases should be handled
var occurrence = 0;
pushButton.watch(function (err:string, value:string) { //Watch for hardware interrupts on pushButton GPIO, specify callback function
  if (err) { //if an error
    console.error('There was an error', err); //output error message to console
  return;
  }
  occurrence ++;
  console.log('BUTTON Action',occurrence);
  muteToggle(1)
  LED.writeSync(value); //turn LED on or off depending on the button state (0 or 1)
});

function unexportOnClose() { //function to run when exiting program
  LED.writeSync(0); // Turn LED off
  LED.unexport(); // Unexport LED GPIO to free resources
  pushButton.unexport(); // Unexport Button GPIO to free resources
};

process.on('SIGINT', unexportOnClose); //function to run when user closes using ctrl+c
