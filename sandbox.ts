import { SoundcraftUI } from 'soundcraft-ui-connection';
import { filter } from 'rxjs/operators';

function logMute() {
  conn.muteGroup(1).state$.subscribe((state) => {
    console.log('Mute 1 is:', state);
  });
}

const conn = new SoundcraftUI("10.0.1.2");
conn.connect();
//console.log(conn);
//conn.disconnect(); // close connection
//conn.reconnect(); // close connection and reconnect after timeout

setTimeout(() => {
    conn.muteGroup(1).toggle()
    logMute()
}, 2000);

setTimeout(() => {
    conn.muteGroup(1).toggle()
    logMute()
}, 4000);

setTimeout(() => {
    conn.muteGroup(1).toggle()
    logMute()
}, 6000);

setTimeout(() => {
    logMute()
    conn.muteGroup(1).toggle()
}, 8000);

//conn.master.faderLevel$.subscribe(value => {
//  console.log('happed', value);
  // ...
//});

//conn.status$.subscribe((status) => {
//  console.log('Connection status', status.type);
//  if (status.type == ConnectionStatus.Error) soundcraft.reconnect();
//});


