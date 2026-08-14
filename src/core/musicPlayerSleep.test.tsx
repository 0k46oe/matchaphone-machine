import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {db,getSetting} from "./db";
import {MusicPlayerProvider,useMusicPlayer} from "./musicPlayer";
import type {ListeningSession,MusicClientSettings} from "./types";

class FakeAudio extends EventTarget{
 src="";preload="";paused=false;currentTime=12;duration=180;volume=.85;playbackRate=1;
 play=vi.fn(async()=>{this.paused=false;this.dispatchEvent(new Event("play"))});
 pause=vi.fn(()=>{this.paused=true;this.dispatchEvent(new Event("pause"))});
}
function Probe(){const player=useMusicPlayer();return <><button onClick={()=>player.setSleepTimer({mode:"duration",endsAt:Date.now()+120})}>start timer</button><span data-testid="volume">{player.volume}</span><span>{player.sleepTimerLabel}</span></>}

describe("MusicPlayer sleep timer",()=>{
 beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal("Audio",FakeAudio)});
 afterEach(()=>{cleanup();vi.unstubAllGlobals()});
 it("fades to pause while keeping an active listening session",async()=>{
  const session:ListeningSession={id:"session",schemaVersion:1,createdAt:1,updatedAt:1,conversationId:"conversation",characterId:"character",state:"active",invitedBy:"user",queue:[],currentIndex:0,playbackState:"playing",positionMs:0,selectedBy:"user",startedAt:1};
  await db.listeningSessions.add(session);
  await db.settings.put({key:"music-client",value:{backgroundPlayback:true,volume:.42,repeatMode:"off",shuffle:false}});
  const view=render(<MusicPlayerProvider><Probe/></MusicPlayerProvider>);
  await waitFor(()=>expect(screen.getByTestId("volume")).toHaveTextContent("0.42"));
  fireEvent.click(screen.getByRole("button",{name:"start timer"}));
  await waitFor(async()=>expect((await db.listeningSessions.get(session.id))?.playbackState).toBe("paused"),{timeout:2000});
  expect((await db.listeningSessions.get(session.id))?.state).toBe("active");
  expect((await db.musicEvents.where("sessionId").equals(session.id).toArray()).some(event=>event.type==="pause"&&event.actor==="system")).toBe(true);
  const settings=await getSetting<MusicClientSettings>("music-client",{} as MusicClientSettings);
  expect(settings.sleepTimer).toBeUndefined();
  view.unmount();
 });
});