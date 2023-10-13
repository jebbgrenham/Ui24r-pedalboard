import { SoundcraftUI } from 'soundcraft-ui-connection'
import { filter } from 'rxjs/operators'
var player = require('play-sound')() 
const conn = new SoundcraftUI("10.0.1.2")
conn.connect()
console.log('Started Program')
console.log('YOU CHANGED IP YOU FOOL')
let mode = "mutesA"
console.log('Started in mode: ', mode)

function subscribeLEDs(LEDindex: number,LED: { writeSync: (state: number) => void, readSync: () => number } ) {
  let index: number | string = LEDindex;
  //if mode is mutes A.... but will this subscribe when mode changes? NO IT WON'T? Need console.
  if (mode === 'mutesA'){ console.log('MODE UPDATED') }
    conn.muteGroup(index as any).state$.subscribe((state) => {
      LED.writeSync(state);
    });

}

function stopButtonListeners() {
  buttons.forEach((button) => button.unwatchAll());
}

function handleMuteEvent(buttonNumber: number) {
  return (err: string, value: string) => {
    if (!err) {
      if (buttonNumber == 7) { conn.muteGroup('fx').toggle() }
      else if (buttonNumber == 8) { conn.muteGroup('all').toggle() } 
      else {conn.muteGroup(buttonNumber).toggle() }
      console.log('Pushed Button:', buttonNumber)
      let stepUp = 1
      if (mode == 'mutesB'){ stepUp = 5 }
//      console.log(stepUp)
      leds.forEach((led, index) => subscribeAndControlLED(index + stepUp, led));
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

function subscribeAndControlLED(
  muteGroupNumber: number,
  LED: { writeSync: (state: number) => void, readSync: () => number }
): void {
  let muteGroup: number | string = muteGroupNumber;
  if (muteGroupNumber === 7) {
    muteGroup = 'fx';
  } else if (muteGroupNumber === 8) {
    muteGroup = 'all';
  }
  console.log('mutegroupnumber is ', muteGroup);
  conn.muteGroup(muteGroup as any).state$.subscribe((state) => {
    LED.writeSync(state);
    console.log(`LED${muteGroup} set to:`, LED.readSync());
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
//leds.forEach((led, index) => subscribeAndControlLED(index + 1, led));
leds.forEach((led, index) => subscribeLEDs(index + 1, led))

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
  leds.forEach((led, index) => subscribeAndControlLED(index + 5, led));
} else if (mode === "mutesB") {
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
