import { SoundcraftUI } from 'soundcraft-ui-connection'
import { filter } from 'rxjs/operators'
var player = require('play-sound')() 
const conn = new SoundcraftUI("192.168.43.160")
conn.connect()
console.log('Started Program')
console.log('YOU CHANGED IP YOU FOOL')
let mode = "mutesA"
console.log('Started in mode: ', mode)
function stopButtonListeners() {
  buttons.forEach((button) => button.unwatchAll());
}

function handleMuteEvent(buttonNumber: number) {
  return (err: string, value: string) => {
    if (!err) {
      if (buttonNumber === 7) { conn.muteGroup('fx').toggle()} 
      else if (buttonNumber === 8) { conn.muteGroup('all').toggle()} 
      else { conn.muteGroup(buttonNumber).toggle() }
    console.log('Pushed Button:', buttonNumber)
    }
  }
}

function handleSamplerEvent(buttonNumber: number) {
  return (err: string, value: string) => {
    if (!err) { 
      player.play('./samples/' + buttonNumber + '.wav', (err: string) => {
      if (err) console.log(`Could not play sound: ${err}`);
      console.log('Played sample', buttonNumber)
      });
    }
  }
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

const Gpio = require('onoff').Gpio;
const ledPinNumbers = [9, 10, 11, 12];
const pushButtonPins = [5, 6, 7, 8, ];
const modeButton = new Gpio(4, 'in', 'rising', { debounceTimeout: 75 })
const LED = ledPinNumbers.map((pin) => new Gpio(pin, 'out'));
const pushButtons = pushButtonPins.map((pin) => new Gpio(pin, 'in', 'rising', { debounceTimeout: 75 }));
const [LED1, LED2, LED3, LED4] = LED;
const [pushButton1, pushButton2, pushButton3, pushButton4] = pushButtons;
const buttons = [pushButton1, pushButton2, pushButton3, pushButton4];
const leds = [LED1, LED2, LED3, LED4];
buttons.forEach((button, index) => button.watch(handleMuteEvent(index + 1)));
leds.forEach((led, index) => subscribeAndControlLED(index + 1, led));


modeButton.watch((err: any, value: any) => {
  if (err) {
    throw err;
  }
  if (value === 1) {
  stopButtonListeners()
  if (mode === "mutesA"){ mode = "mutesB" } else if (mode === "mutesB"){ mode = "sampler" } else if (mode === "sampler"){mode = "player" } else if (mode === "player"){ mode = "mutesA"}
  console.log('Mode is now ', mode)
  if (mode === "mutesA") {
  buttons.forEach((button, index) => button.watch(handleMuteEvent(index + 1)));
  leds.forEach((led, index) => subscribeAndControlLED(index + 1, led));
} else if (mode === "mutesB") {
  buttons.forEach((button, index) => button.watch(handleMuteEvent(index + 5)));
} else if (mode === "sampler") {
  buttons.forEach((button, index) => button.watch(handleSamplerEvent(index + 1)));
} else if (mode === "player"){}

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
