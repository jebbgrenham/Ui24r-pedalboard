import { SoundcraftUI } from 'soundcraft-ui-connection';
import { interval, Subscription, Subject } from 'rxjs';
import * as os from 'os';
import * as ui24rInterface from './ui24rInterface';
import { exec, ExecException } from 'child_process';
const Gpio = require('onoff').Gpio;

//Prove we booted
var FourteenSegment = require('ht16k33-fourteensegment-display');
var display = new FourteenSegment(0x70, 1);
display.writeString("A.C.A.B");


const ping = require('ping');

let conn: SoundcraftUI;

// Function to get the subnet based on the device's IP on wlan0
function getSubnet(): string | null {
  const networkInterfaces = os.networkInterfaces();
  const wlan0Interface = networkInterfaces['wlan0'];

  if (wlan0Interface) {
    const ipAddress = wlan0Interface.find((info) => info.family === 'IPv4')?.address;

    if (ipAddress) {
      // Assuming the subnet is in the format 'xxx.xxx.xxx'
      const subnet = ipAddress.split('.').slice(0, 3).join('.');
      return subnet;
    }
  }

  return null;
}

async function discoverSoundcraftUI(): Promise<string | null> {
  const subnet = getSubnet();
  console.log("Subnet is ", subnet)
  if (subnet) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const pingPromises: Promise<[string, boolean] | null>[] = [];

      for (let i = 1; i <= 255; i++) {
        const ip = `${subnet}.${i}`;
        pingPromises.push(pingAndCheck(ip));
      }
     const results = await Promise.all(pingPromises);

      for (const result of results) {
        if (result && result[1]) {
          const connectedIP = await attemptConnection(result[0]);
          if (connectedIP) {
            return connectedIP;
          }
        }
      }
    }
  }

  return null; // No reachable device found after 5 attempts
}

async function pingAndCheck(ip: string): Promise<[string, boolean] | null> {
  try {
    const result: any = await ping.promise.probe(ip);
    return [ip, result.alive];
  } catch (error) {
    return null;
  }
}

// ...


async function attemptConnection(ip: string): Promise<string | null> {
  return new Promise((resolve) => {
    conn = new SoundcraftUI(ip);

    // Subscribe to status changes
    const statusSubscription = conn.status$.subscribe(status => {
      //console.log('Connection status:', status);

      if (status.type === 'OPEN') {
        // Connection successful, complete the Promise
        console.log('Ah excellent! Here is a mixer I can talk to')
        
        //show IP to user
        const [ip1, ip2, ip3, ip4] = ip.split('.');
        const showWithDelay = (ip, delay) => {
          setTimeout(() => {
            display.writeString(ip);
          }, delay);
        };
        // Show each digit
        showWithDelay(ip1 + '.', 0);
        showWithDelay(ip2 + '.', 1000);
        showWithDelay(ip3 + '.', 2000);
        showWithDelay(ip4, 3000);

        statusSubscription.unsubscribe();
        resolve(ip);
      } else if (status.type === 'ERROR') {
        // Connection error, move on to the next IP
        console.log('Nope,', ip, 'is not a mixer :\(')
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
    } catch (error) {
      // Handle connection errors
      console.error(`Connection to ${ip} failed:`, error);
      resolve(null);
    }
  });
}

// ...

async function initializeSoundcraftUIConnection(): Promise<boolean> {
  const discoveredIP = await discoverSoundcraftUI();

  if (!discoveredIP) {
    console.error('No SoundcraftUI device found on the network.');
    return false;
  }

  conn = new SoundcraftUI(discoveredIP);

  try {
    await conn.connect();
    console.log('Connected to SoundcraftUI at:', discoveredIP);
    ui24rInterface.mainInterface(conn,display);
   return true;
  } catch (error) {
    console.error(`Connection to ${discoveredIP} failed:`, error);
    return false;
  }
}




// Initialize shutdown button 
const shutdownButton = new Gpio(8, 'in', 'both', { debounceTimeout: 75 });
let isShutdownButtonPressed = false;
let shutdownTimeout: NodeJS.Timeout | null = null;

function handleShutdown() {
  console.log('Shutting down...');
  executeShutdownCommand();
}

shutdownButton.watch((err: any, value: any) => {
  if (err) {
    throw err;
  }

  if (value === 0) {
    isShutdownButtonPressed = true;
    shutdownTimeout = setTimeout(() => {
      if (isShutdownButtonPressed) {
        display.writeString('BYE.{')
//        var FourteenSegment = require('ht16k33-fourteensegment-display');
//        display = new FourteenSegment(0x71, 1);
        handleShutdown();
      }
      shutdownTimeout = null;
    }, 3000);
  } else if (value === 1) {
    isShutdownButtonPressed = false;
    if (shutdownTimeout) {
      clearTimeout(shutdownTimeout);
      shutdownTimeout = null;
    }
  }
});

function executeShutdownCommand() {
  exec('sudo shutdown -h now', (error: Error | null, stdout: string, stderr: string) => {
    if (error) {
      console.error(`Error during shutdown: ${error}`);
    } else {
      console.log('Shutdown initiated successfully.');
    }
  });
}

initializeSoundcraftUIConnection();

process.on('SIGINT', () => {
  display.writeString('BYE.{')
  console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
  process.exit(0);
});

