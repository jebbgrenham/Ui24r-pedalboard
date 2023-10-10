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

var Gpio = require('onoff').Gpio; //include onoff to interact with the GPIO
var LED1 = new Gpio(9, 'out') //use GPIO pins as output
var LED2 = new Gpio(10, 'out')
var LED3 = new Gpio(11, 'out')
var LED4 = new Gpio(12, 'out')
var pushButton1 = new Gpio(5, 'in', 'rising', {debounceTimeout: 75}) //use GPIO pins as input
var pushButton2 = new Gpio(6, 'in', 'rising', {debounceTimeout: 75})
var pushButton3 = new Gpio(7, 'in', 'rising', {debounceTimeout: 75})
var pushButton4 = new Gpio(8, 'in', 'rising', {debounceTimeout: 75})

conn.muteGroup(1).state$.subscribe((state) => { //keep LED in correct state
  console.log('Should LED to:', state)
  LED1.writeSync(state)
  console.log(LED1.readSync())
});

pushButton1.watch(function (err:string, value:string) { //Watch for hardware interrupts
  if (err) { //if an error
    console.error('There was an error', err); //output error message to console
  return;
  }
  muteToggle(1)
//  LED1.writeSync(value)
//  conn.muteGroup(1).state$.subscribe((state) => {
//  console.log('Mute 1 is:', state);
//  });
});
pushButton2.watch(function (err:string, value:string) { //Watch for hardware interrupts
  if (err) { //if an error
    console.error('There was an error', err); //output error message to console
  return;
  }
  muteToggle(2)
});
pushButton3.watch(function (err:string, value:string) { //Watch for hardware interrupts
  if (err) { //if an error
    console.error('There was an error', err); //output error message to console
  return;
  }
  muteToggle(3)
});
pushButton4.watch(function (err:string, value:string) { //Watch for hardware interrupts
  if (err) { //if an error
    console.error('There was an error', err); //output error message to console
  return;
  }
  muteToggle(4)
});




function unexportOnClose() { //function to run when exiting program
  LED1.writeSync(0); // Turn LED off
  LED1.unexport(); // Unexport LED GPIO to free resources
  pushButton1.unexport(); // Unexport Button GPIO to free resources
};

process.on('SIGINT', unexportOnClose); //function to run when user closes using ctrl+c
