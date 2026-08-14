import type {BackgroundActivityKeepaliveMode,BackgroundActivityMode} from "./types";

let context:AudioContext|undefined,oscillator:OscillatorNode|undefined,gain:GainNode|undefined,audio:HTMLAudioElement|undefined,audioUrl="";

function silentWav(){const rate=8000,samples=rate,buffer=new ArrayBuffer(44+samples*2),view=new DataView(buffer),write=(offset:number,value:string)=>[...value].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)));write(0,"RIFF");view.setUint32(4,36+samples*2,true);write(8,"WAVE");write(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,samples*2,true);return new Blob([buffer],{type:"audio/wav"})}
function emit(activeModes:BackgroundActivityKeepaliveMode[]){window.dispatchEvent(new CustomEvent("mira:background-activity-status",{detail:{active:activeModes.length>0,modes:activeModes}}))}
function stopOscillator(){try{oscillator?.stop()}catch{}oscillator=undefined;gain=undefined;if(context){void context.close();context=undefined}}
function stopSilentAudio(){if(audio){audio.pause();audio.src="";audio=undefined}if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=""}}

export function stopBackgroundActivity(){stopOscillator();stopSilentAudio();emit([])}

async function startOscillator(){try{const AudioContextClass=window.AudioContext||(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!AudioContextClass)return false;context=new AudioContextClass();await context.resume();oscillator=context.createOscillator();gain=context.createGain();gain.gain.value=.00001;oscillator.connect(gain);gain.connect(context.destination);oscillator.start();return true}catch{stopOscillator();return false}}
async function startSilentAudio(){try{audioUrl=URL.createObjectURL(silentWav());audio=new Audio(audioUrl);audio.loop=true;audio.volume=.001;await audio.play();return true}catch{stopSilentAudio();return false}}

export async function startBackgroundActivities(input:BackgroundActivityKeepaliveMode[]){stopOscillator();stopSilentAudio();const requested=[...new Set(input)],active:BackgroundActivityKeepaliveMode[]=[];if(requested.includes("oscillator")&&await startOscillator())active.push("oscillator");if(requested.includes("silent-audio")&&await startSilentAudio())active.push("silent-audio");emit(active);return active}
export async function startBackgroundActivity(mode:BackgroundActivityMode){if(mode==="off"){stopBackgroundActivity();return false}return(await startBackgroundActivities([mode])).length>0}
export function pauseBackgroundActivity(){if(context?.state==="running")void context.suspend();if(audio&&!audio.paused)audio.pause()}
export async function resumeBackgroundActivity(){try{if(context?.state==="suspended")await context.resume()}catch{}try{if(audio?.paused)await audio.play()}catch{}}
