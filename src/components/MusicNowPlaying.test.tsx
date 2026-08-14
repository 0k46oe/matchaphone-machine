import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {MusicNowPlaying} from "./MusicNowPlaying";

let player:Record<string,any>;
vi.mock("../core/musicPlayer",()=>({useMusicPlayer:()=>player}));

const makePlayer=()=>({
 currentTrack:{id:"track",source:"direct-url",title:"晴天",artists:["茶茶"],album:"夏日",durationMs:180000,coverUrl:"data:image/png;base64,AA==",favorite:false},
 playing:true,positionMs:1500,durationMs:180000,lyrics:[{timeMs:0,text:"第一句",translation:"Line one"},{timeMs:1000,text:"第二句",translation:"Line two"}],repeatMode:"off",shuffle:false,volume:.8,lyricsTranslationVisible:true,lyricsFontSize:"medium",sleepTimer:undefined,sleepTimerLabel:"",toggleFavorite:vi.fn(),seek:vi.fn(),toggleShuffle:vi.fn(),previous:vi.fn(),toggle:vi.fn(),next:vi.fn(),cycleRepeat:vi.fn(),setVolume:vi.fn(),setLyricsTranslationVisible:vi.fn(),setLyricsFontSize:vi.fn(),setSleepTimer:vi.fn(),cancelSleepTimer:vi.fn(),
});

describe("MusicNowPlaying",()=>{
 afterEach(cleanup);
 beforeEach(()=>{player=makePlayer();Object.defineProperty(Element.prototype,"scrollIntoView",{configurable:true,value:vi.fn()})});
 it("switches between cover and lyrics and seeks from a timed lyric",()=>{
  render(<MusicNowPlaying onClose={vi.fn()} onOpenQueue={vi.fn()} onEdit={vi.fn()} onNotice={vi.fn()}/>);
  fireEvent.click(screen.getByRole("tab",{name:"歌词"}));
  expect(screen.getByRole("tab",{name:"歌词"})).toHaveAttribute("aria-selected","true");
  fireEvent.click(screen.getByRole("button",{name:/第二句/}));
  expect(player.seek).toHaveBeenCalledWith(1000);
 });
 it("persists translation and font controls through the player API",()=>{
  render(<MusicNowPlaying onClose={vi.fn()} onOpenQueue={vi.fn()} onEdit={vi.fn()} onNotice={vi.fn()}/>);
  fireEvent.click(screen.getByRole("tab",{name:"歌词"}));
  fireEvent.click(screen.getByRole("button",{name:"隐藏翻译"}));
  fireEvent.click(screen.getByRole("button",{name:"大号歌词"}));
  expect(player.setLyricsTranslationVisible).toHaveBeenCalledWith(false);
  expect(player.setLyricsFontSize).toHaveBeenCalledWith("large");
 });
 it("sets and cancels sleep timers from the sheet",()=>{
  const notice=vi.fn();
  const view=render(<MusicNowPlaying onClose={vi.fn()} onOpenQueue={vi.fn()} onEdit={vi.fn()} onNotice={notice}/>);
  fireEvent.click(screen.getByRole("button",{name:"设置睡眠定时"}));
  fireEvent.click(screen.getByRole("button",{name:"15 分钟"}));
  expect(player.setSleepTimer).toHaveBeenCalledWith(expect.objectContaining({mode:"duration"}));
  expect(notice).toHaveBeenCalledWith("已设置 15 分钟睡眠定时");
  view.unmount();
  player={...makePlayer(),sleepTimer:{mode:"track-end",trackId:"track"},sleepTimerLabel:"本曲播完"};
  render(<MusicNowPlaying onClose={vi.fn()} onOpenQueue={vi.fn()} onEdit={vi.fn()} onNotice={notice}/>);
  fireEvent.click(screen.getByRole("button",{name:"睡眠定时剩余 本曲播完"}));
  fireEvent.click(screen.getByRole("button",{name:"取消定时"}));
  expect(player.cancelSleepTimer).toHaveBeenCalled();
 });
});