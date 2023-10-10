import { SoundcraftUI } from 'soundcraft-ui-connection';

console.log('Welcome application');

const conn = new SoundcraftUI("10.0.1.2");
conn.connect();

//console.log(conn);

//conn.disconnect(); // close connection
//conn.reconnect(); // close connection and reconnect after timeout

console.log('Ill print first');

setTimeout(() => {
    conn.muteGroup(1).toggle()
    console.log('Mute 1 toggled');
}, 2000);

setTimeout(() => {
    conn.muteGroup(1).toggle()
    console.log('Mute 1 toggled');
}, 4000);

setTimeout(() => {
    conn.muteGroup(1).toggle()
    console.log('Mute 1 toggled');
}, 6000);

setTimeout(() => {
    conn.muteGroup(1).toggle()
    console.log('Mute 1 toggled');
}, 8000);

setTimeout(() => {
    conn.muteGroup(1).toggle()
    console.log('Mute 1 toggled');
}, 10000);

setTimeout(() => {
    conn.muteGroup(1).toggle()
    console.log('Mute 1 toggled');
}, 12000);

setTimeout(() => {
    conn.muteGroup(1).toggle()
    console.log('Mute 1 toggled');
}, 14000);

setTimeout(() => {
    conn.muteGroup(1).toggle()
    console.log('Mute 1 toggled');
}, 16000);



