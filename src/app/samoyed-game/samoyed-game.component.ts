import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component,
  ElementRef, inject, NgZone, OnDestroy, PLATFORM_ID, ViewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

type DogAction = 'idle' | 'feeding' | 'playing' | 'sleeping';
interface SavedGame { fullness: number; happiness: number; energy: number; }

@Component({
  selector: 'app-samoyed-game',
  standalone: true,
  templateUrl: './samoyed-game.component.html',
  styleUrl: './samoyed-game.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SamoyedGameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('roomCanvas') private canvasRef!: ElementRef<HTMLCanvasElement>;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly storageKey = 'samoyed-room-v1';

  readonly dogName = '棉花';
  fullness = 75;
  happiness = 80;
  energy = 85;
  action: DogAction = 'idle';
  actionLabel = '正在房间里散步';
  message = '棉花搬进来了，正在等你陪它玩。';
  sleepButtonLabel = '睡觉';
  busy = false;
  sleeping = false;

  private context: CanvasRenderingContext2D | null = null;
  private animationId = 0;
  private careTimer?: ReturnType<typeof setInterval>;
  private actionTimer?: ReturnType<typeof setTimeout>;
  private dogX = 185;
  private targetX = 185;
  private facing = 1;
  private nextWanderAt = 0;
  private previousFrame = 0;
  private destroyed = false;
  private reducedMotion = false;

  private readonly dogSprite = [
    '....WW........WW....',
    '...WEEW......WEEW...',
    '...WEEWWWWWWWEEWW...',
    '..WWWWWWWWWWWWWWWW..',
    '.WWWWWWWWWWWWWWWWWW.',
    '.WWWWWWWWWWWWWWWWWW.',
    'WWWWWNWWWWWWNWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWW',
    '.WWWWWWWWNNWWWWWWWW.',
    '..WWWWWWWWWWWWWWWW..',
    '...WWWWWNWWNWWWWW...',
    '....WWWWWRRWWWWW....',
    '...WWWWWWWWWWWWWW...',
    '..WWWWWWWWWWWWWWWW..',
    '..WWWWWWWWWWWWWWWW..',
    '..WWWWWWWWWWWWWWWW..',
    '...WWWWWWWWWWWWWW...',
    '...WSSWWWWWWSSWWW...',
    '...WWW......WWW.....',
    '...SSS......SSS.....',
  ];
  private readonly palette: Record<string, string> = {
    W: '#fffdf5', S: '#d8dedb', N: '#394641', R: '#df9392', E: '#eac9b5',
  };

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.restore();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.context = this.canvasRef.nativeElement.getContext('2d');
    if (!this.context) {
      this.message = '当前浏览器无法显示游戏画面，请换一个浏览器再试。';
      this.busy = true;
      this.cdr.markForCheck();
      return;
    }
    this.context.imageSmoothingEnabled = false;
    this.zone.runOutsideAngular(() => {
      this.animationId = requestAnimationFrame(this.animate);
    });
    this.careTimer = setInterval(() => {
      if (this.sleeping) {
        this.energy = this.clamp(this.energy + 5);
        this.fullness = this.clamp(this.fullness - 1);
      } else {
        this.fullness = this.clamp(this.fullness - 2);
        this.energy = this.clamp(this.energy - 1);
        this.happiness = this.clamp(this.happiness - 1);
      }
      this.save();
      this.cdr.markForCheck();
    }, 15000);
    this.cdr.markForCheck();
  }

  feed(): void {
    if (this.busy || this.sleeping) return;
    if (this.fullness >= 100) {
      this.message = '棉花已经吃饱啦，陪它待一会儿吧。';
      return;
    }
    this.startAction('feeding', 87, '正在吃饭', '棉花闻到了晚餐的香味，跑向自己的饭碗。');
    this.actionTimer = setTimeout(() => {
      this.fullness = this.clamp(this.fullness + 25);
      this.happiness = this.clamp(this.happiness + 5);
      this.finishAction('吃饱啦！棉花开心地舔了舔嘴巴。');
    }, 5000);
  }

  play(): void {
    if (this.busy || this.sleeping) return;
    if (this.energy < 15) {
      this.message = '棉花有点累了，让它先睡一觉吧。';
      return;
    }
    this.startAction('playing', 270, '正在追球', '球球滚出去啦，棉花马上追了过去！');
    this.actionTimer = setTimeout(() => {
      this.happiness = this.clamp(this.happiness + 25);
      this.energy = this.clamp(this.energy - 12);
      this.fullness = this.clamp(this.fullness - 5);
      this.finishAction('棉花把球带回来了，还想和你再玩一次。');
    }, 6500);
  }

  toggleSleep(): void {
    if (this.busy) return;
    if (this.sleeping) {
      this.sleeping = false;
      this.action = 'idle';
      this.actionLabel = '刚刚睡醒';
      this.sleepButtonLabel = '睡觉';
      this.message = '棉花伸了个懒腰，又是精神满满的一天。';
    } else {
      this.sleeping = true;
      this.action = 'sleeping';
      this.targetX = 302;
      this.actionLabel = '正在休息，体力慢慢恢复';
      this.sleepButtonLabel = '叫醒';
      this.message = '棉花准备回小窝睡觉啦。';
    }
    this.save();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (isPlatformBrowser(this.platformId)) cancelAnimationFrame(this.animationId);
    clearInterval(this.careTimer);
    clearTimeout(this.actionTimer);
  }

  private startAction(action: DogAction, targetX: number, label: string, message: string): void {
    this.action = action;
    this.busy = true;
    this.targetX = targetX;
    this.actionLabel = label;
    this.message = message;
  }

  private finishAction(message: string): void {
    this.action = 'idle';
    this.busy = false;
    this.actionLabel = '正在房间里散步';
    this.message = message;
    this.nextWanderAt = performance.now() + 2000;
    this.save();
    this.cdr.markForCheck();
  }

  private readonly animate = (time: number): void => {
    if (this.destroyed) return;
    const delta = this.previousFrame ? Math.min((time - this.previousFrame) / 1000, 0.05) : 0;
    this.previousFrame = time;
    if (this.action === 'idle' && time > this.nextWanderAt) {
      this.targetX = 105 + Math.random() * 175;
      this.nextWanderAt = time + 4000 + Math.random() * 2500;
    }
    if (this.action === 'playing') this.targetX = 194 + Math.sin(time / 600) * 82;
    const distance = this.targetX - this.dogX;
    const moving = Math.abs(distance) > 1;
    const speed = this.action === 'playing' ? 105 : 55;
    if (moving) {
      this.facing = distance > 0 ? 1 : -1;
      this.dogX += Math.sign(distance) * Math.min(Math.abs(distance), speed * delta);
    }
    this.drawRoom(time, moving);
    this.animationId = requestAnimationFrame(this.animate);
  };

  private drawRoom(time: number, moving: boolean): void {
    const ctx = this.context;
    if (!ctx) return;
    const rect = (x: number, y: number, w: number, h: number, color: string): void => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };
    ctx.clearRect(0, 0, 384, 240);
    // 墙面、踢脚线和木地板。
    rect(0, 0, 384, 145, '#eee2c9');
    rect(0, 145, 384, 95, '#c79870');
    rect(0, 140, 384, 6, '#927557');
    rect(0, 146, 384, 3, '#e2bb8d');
    for (let row = 0; row < 5; row++) {
      const y = 150 + row * 20;
      rect(0, y + 18, 384, 1, '#ad7e59');
      for (let col = 0; col < 5; col++) {
        const x = col * 90 + (row % 2 ? -40 : 0);
        rect(x, y, 1, 18, '#ad7e59');
        rect(x + 12, y + 9, 22, 1, '#bf8d65');
      }
    }
    // 窗户、窗外景色和窗帘。
    rect(32, 24, 98, 89, '#94785c');
    rect(36, 28, 90, 80, '#b9d8d5');
    rect(44, 36, 74, 64, '#cce6df');
    rect(98, 43, 10, 10, '#fff1bc');
    rect(44, 83, 74, 17, '#a8b791');
    rect(49, 77, 20, 23, '#8baf92');
    rect(99, 73, 19, 27, '#8baf92');
    rect(78, 28, 5, 80, '#f7edda');
    rect(36, 65, 90, 5, '#f7edda');
    rect(27, 108, 108, 7, '#aa8761');
    rect(23, 22, 13, 77, '#a3b4a0');
    rect(126, 22, 13, 77, '#a3b4a0');
    rect(26, 25, 3, 69, '#bdc9af');
    rect(132, 25, 3, 69, '#bdc9af');
    // 挂画。
    rect(175, 34, 40, 43, '#a58462');
    rect(179, 38, 32, 35, '#fff4da');
    rect(187, 48, 6, 6, '#d8ad73');
    rect(194, 55, 10, 9, '#9db096');
    // 搁板、植物、书本。
    rect(269, 78, 76, 6, '#a58462');
    rect(278, 84, 4, 8, '#927456');
    rect(333, 84, 4, 8, '#927456');
    rect(280, 62, 14, 16, '#c58c6c');
    rect(283, 65, 8, 13, '#d9a07d');
    rect(285, 44, 4, 20, '#648b68');
    rect(277, 49, 10, 7, '#82a17b');
    rect(288, 44, 9, 7, '#82a17b');
    rect(309, 58, 7, 20, '#b3bfa7');
    rect(318, 54, 7, 24, '#d5b27c');
    rect(327, 61, 7, 17, '#c98f7c');
    // 地毯。
    rect(108, 174, 162, 43, '#b6b699');
    rect(113, 169, 152, 53, '#b6b699');
    rect(119, 175, 140, 41, '#d0ccb0');
    rect(125, 180, 128, 2, '#b6b699');
    rect(125, 209, 128, 2, '#b6b699');
    // 薄荷绿狗窝。
    rect(274, 176, 83, 40, '#6e8e80');
    rect(280, 169, 71, 43, '#86a497');
    rect(285, 175, 61, 30, '#d9cfb5');
    rect(291, 180, 49, 18, '#eee3ca');
    rect(280, 205, 71, 7, '#76988a');
    // 饭碗。
    rect(46, 197, 48, 5, '#9e7659');
    rect(52, 187, 35, 12, '#b16e56');
    rect(56, 183, 27, 5, '#d29673');
    rect(58, 184, 23, 3, '#78563f');
    if (this.action === 'feeding') {
      rect(62, 182, 4, 3, '#c09b65');
      rect(71, 182, 4, 3, '#c09b65');
    }
    if (this.action === 'playing') {
      const x = 205 + Math.sin(time / 600 + 0.6) * 82;
      const y = 194 - Math.abs(Math.sin(time / 180)) * 12;
      rect(x, y, 10, 10, '#ba7059');
      rect(x + 2, y - 2, 6, 14, '#ba7059');
      rect(x + 2, y + 2, 3, 3, '#f3d2a4');
    }
    const resting = this.sleeping && !moving;
    const eating = this.action === 'feeding' && !moving;
    const bounce = this.reducedMotion ? 0 : moving
      ? Math.floor(Math.sin(time / 90) * 2)
      : eating ? Math.floor(Math.sin(time / 130) * 2) : 0;
    ctx.save();
    ctx.translate(Math.round(this.dogX), resting ? 193 : 197 + bounce);
    ctx.scale(this.facing, 1);
    const wag = resting || this.reducedMotion ? 0 : Math.floor(Math.sin(time / 110) * 2);
    rect(15, -26 + wag, 12, 10, '#d8dedb');
    rect(19, -32 + wag, 10, 10, '#fffdf5');
    rect(24, -35 + wag, 8, 9, '#fffdf5');
    rect(27, -30 + wag, 7, 9, '#fffdf5');
    ctx.scale(2, resting ? 1.4 : 2);
    this.dogSprite.forEach((row, y) => {
      [...row].forEach((pixel, x) => {
        if (pixel === '.') return;
        const color = resting && y === 6 && pixel === 'N' ? this.palette['W'] : this.palette[pixel];
        rect(x - 10, y - 20, 1, 1, color);
      });
    });
    if (resting) {
      rect(-5, -13, 3, 1, '#394641');
      rect(2, -13, 3, 1, '#394641');
    }
    ctx.restore();
    if (resting || eating) {
      const x = Math.round(this.dogX) - 18;
      rect(x, 126, 38, 20, '#fff8e8');
      rect(x + 12, 146, 5, 5, '#fff8e8');
      ctx.fillStyle = '#586a55';
      ctx.font = '10px monospace';
      ctx.fillText(resting ? 'z Z' : 'yum', x + 8, 140);
    }
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private save(): void {
    try {
      const data: SavedGame = {
        fullness: this.fullness, happiness: this.happiness, energy: this.energy,
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch { /* 储存不可用时仍然可以继续玩。 */ }
  }

  private restore(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      const saved = data as Partial<SavedGame>;
      if (typeof saved.fullness === 'number' && Number.isFinite(saved.fullness)) this.fullness = this.clamp(saved.fullness);
      if (typeof saved.happiness === 'number' && Number.isFinite(saved.happiness)) this.happiness = this.clamp(saved.happiness);
      if (typeof saved.energy === 'number' && Number.isFinite(saved.energy)) this.energy = this.clamp(saved.energy);
      this.message = '你回来啦，棉花一直在这里等你。';
    } catch { /* 损坏存档使用默认值。 */ }
  }
}
