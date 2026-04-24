export interface EasterEgg {
  id: string;
  name: string;
  description: string;
  trigger: EasterEggTrigger;
  activated: boolean;
  activatedAt?: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  message: string;
  reward?: EasterEggReward;
}

export interface EasterEggTrigger {
  type: 'command' | 'keyword' | 'sequence' | 'time' | 'count' | 'random' | 'combo';
  pattern: string | string[] | RegExp;
  count?: number;
  probability?: number;
  comboKeys?: string[];
  comboTimeout?: number;
}

export interface EasterEggReward {
  type: 'badge' | 'theme' | 'buddy' | 'message' | 'feature' | 'stat';
  value: unknown;
  permanent: boolean;
  duration?: number;
}

export interface EggCollection {
  totalEggs: number;
  discoveredEggs: number;
  undiscoveredEggs: number;
  rareEggs: number;
  legendaryEggs: number;
  badges: Badge[];
  stats: EggStats;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt?: number;
  rarity: EasterEgg['rarity'];
}

export interface EggStats {
  totalActivations: number;
  eggsPerRarity: Record<EasterEgg['rarity'], number>;
  lastActivation?: number;
  longestStreak: number;
  currentStreak: number;
  discoveryTimestamps: number[];
}

export interface ComboState {
  keys: string[];
  startTime: number;
  lastKeyTime: number;
}

export class EasterEggManager {
  private eggs: Map<string, EasterEgg> = new Map();
  private comboState: ComboState | null = null;
  private activationHistory: string[] = [];
  private stats: EggStats = {
    totalActivations: 0,
    eggsPerRarity: {
      common: 0,
      uncommon: 0,
      rare: 0,
      legendary: 0,
    },
    longestStreak: 0,
    currentStreak: 0,
    discoveryTimestamps: [],
  };
  private listeners: Map<string, (egg: EasterEgg) => void> = new Map();

  constructor() {
    this.initializeDefaultEggs();
  }

  private initializeDefaultEggs(): void {
    this.registerEgg({
      id: 'hello_world',
      name: 'Hello World!',
      description: 'The classic first program',
      trigger: { type: 'command', pattern: 'hello' },
      activated: false,
      rarity: 'common',
      message: 'Hello, World! Welcome to your AI coding adventure! 🌍',
    });

    this.registerEgg({
      id: 'magic_8ball',
      name: 'Magic 8-Ball',
      description: 'Shake the magic 8-ball for answers',
      trigger: { type: 'keyword', pattern: ['will it work', 'magic 8', 'should i'] },
      activated: false,
      rarity: 'uncommon',
      message: '🎱 The Magic 8-Ball says: ${answer}',
      reward: { type: 'message', value: 'You gained mystical insight!', permanent: true },
    });

    this.registerEgg({
      id: 'konami_code',
      name: 'Konami Code',
      description: 'The legendary cheat code',
      trigger: {
        type: 'combo',
        pattern: [],
        comboKeys: ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'],
        comboTimeout: 3000,
      },
      activated: false,
      rarity: 'legendary',
      message: '🕹️ 30 LIVES GRANTED! Ready player one!',
      reward: { type: 'badge', value: 'konami_warrior', permanent: true },
    });

    this.registerEgg({
      id: 'coffee_break',
      name: 'Coffee Break',
      description: 'Take a coffee break',
      trigger: { type: 'keyword', pattern: ['coffee', '☕', 'caffeine', 'espresso'] },
      activated: false,
      rarity: 'common',
      message: '☕ *brews a fresh cup of coffee* Here you go! Now, let\'s write some amazing code!',
    });

    this.registerEgg({
      id: 'matrix',
      name: 'The Matrix',
      description: 'Follow the white rabbit',
      trigger: { type: 'keyword', pattern: ['matrix', 'red pill', 'blue pill', 'neo'] },
      activated: false,
      rarity: 'rare',
      message: '💊 Wake up, Neo... The Matrix has you...',
      reward: { type: 'theme', value: 'matrix_mode', permanent: true },
    });

    this.registerEgg({
      id: 'starwars',
      name: 'The Force',
      description: 'May the Force be with you',
      trigger: { type: 'keyword', pattern: ['may the force', 'star wars', 'darth vader', 'jedi'] },
      activated: false,
      rarity: 'rare',
      message: '⚔️ May the Force be with you, always.',
    });

    this.registerEgg({
      id: 'harry_potter',
      name: 'Wizard Coder',
      description: 'It\'s leviOsa, not levioSA!',
      trigger: { type: 'keyword', pattern: ['lumos', 'expelliarmus', 'wingardium', 'leviosa', 'muggle'] },
      activated: false,
      rarity: 'uncommon',
      message: '✨ Wingardium Leviosa! *makes the code fly*',
    });

    this.registerEgg({
      id: 'pirate',
      name: 'Pirate Mode',
      description: 'Ahoy matey!',
      trigger: { type: 'keyword', pattern: ['ahoy', 'arrr', 'ye', 'matey', 'shiver me timbers'] },
      activated: false,
      rarity: 'uncommon',
      message: '🏴‍☠️ Ahoy there, coder! Ready to pillage some code?',
    });

    this.registerEgg({
      id: 'yoda',
      name: 'Yodish',
      description: 'Do or do not, there is no try',
      trigger: { type: 'keyword', pattern: ['yoda', 'do or do not', 'try', 'fear is the path'] },
      activated: false,
      rarity: 'uncommon',
      message: '🧙 Do or do not. There is no try.',
    });

    this.registerEgg({
      id: 'terminal_hacker',
      name: 'Terminal Hacker',
      description: 'I\'m in.',
      trigger: { type: 'sequence', pattern: ['hack', 'cyber', '1337', 'root', 'sudo'] },
      activated: false,
      rarity: 'rare',
      message: '💻 Access granted. Welcome, hacker.',
      reward: { type: 'stat', value: { name: 'hacker_creds', amount: 100 }, permanent: true },
    });

    this.registerEgg({
      id: 'midas_touch',
      name: 'Midas Touch',
      description: 'Everything you code turns to gold',
      trigger: { type: 'count', pattern: 'successful_commits', count: 100 },
      activated: false,
      rarity: 'legendary',
      message: '👑 King Midas touch! Every line of code you write turns to gold!',
      reward: { type: 'badge', value: 'golden_coder', permanent: true },
    });

    this.registerEgg({
      id: 'midnight_coder',
      name: 'Midnight Coder',
      description: 'Code at midnight',
      trigger: { type: 'time', pattern: '00:00' },
      activated: false,
      rarity: 'rare',
      message: '🌙 The witching hour coder! Only the best code is written at midnight.',
    });

    this.registerEgg({
      id: 'zen_master',
      name: 'Zen Master',
      description: 'Empty your mind',
      trigger: { type: 'keyword', pattern: ['zen', 'bamboo', 'meditation', 'peaceful'] },
      activated: false,
      rarity: 'uncommon',
      message: '🎋 A monk appears: "The best code is no code at all."',
    });

    this.registerEgg({
      id: 'dungeon_master',
      name: 'Dungeon Master',
      description: 'Roll for initiative',
      trigger: { type: 'keyword', pattern: ['d20', 'roll', 'initiative', 'dungeon', 'dragon'] },
      activated: false,
      rarity: 'rare',
      message: '🎲 *rolls 20* Critical hit! The code compiles on first try!',
    });

    this.registerEgg({
      id: 'rick_roll',
      name: 'Never Gonna Give You Up',
      description: 'We\'re no strangers to love',
      trigger: { type: 'keyword', pattern: ['never gonna', 'rick roll', 'give you up', 'let you down'] },
      activated: false,
      rarity: 'uncommon',
      message: '🎵 Never gonna give you up, never gonna let you down...',
    });

    this.registerEgg({
      id: 'coffee_100',
      name: 'Caffeine Addict',
      description: '100 cups of coffee',
      trigger: { type: 'count', pattern: 'coffee_commands', count: 100 },
      activated: false,
      rarity: 'legendary',
      message: '☕☕☕ You\'ve had 100 cups of coffee! Warning: may cause excessive productivity.',
    });

    this.registerEgg({
      id: 'random_legendary',
      name: 'Lucky Star',
      description: 'A 1% chance',
      trigger: { type: 'random', pattern: '', probability: 0.01 },
      activated: false,
      rarity: 'legendary',
      message: '⭐ LUCKY! You found a hidden legendary easter egg!',
      reward: { type: 'badge', value: 'lucky_star', permanent: true },
    });

    this.registerEgg({
      id: 'debug_dance',
      name: 'Debug Dance',
      description: 'When nothing else works, dance',
      trigger: { type: 'keyword', pattern: ['debug dance', 'dance it out', 'stuck dancing'] },
      activated: false,
      rarity: 'common',
      message: '💃 *starts debugging dance* Let\'s shake these bugs loose!',
    });

    this.registerEgg({
      id: 'rubber_duck',
      name: 'Rubber Duck',
      description: 'Have you tried rubber duck debugging?',
      trigger: { type: 'keyword', pattern: ['rubber duck', 'duck debugging', 'explain it'] },
      activated: false,
      rarity: 'uncommon',
      message: '🦆 Quack! I\'m listening. Now explain your problem to me slowly...',
    });
  }

  registerEgg(egg: EasterEgg): void {
    this.eggs.set(egg.id, { ...egg, activated: false });
  }

  unregisterEgg(eggId: string): boolean {
    return this.eggs.delete(eggId);
  }

  trigger(input: string): EasterEgg | null {
    const normalizedInput = input.toLowerCase().trim();

    for (const [id, egg] of this.eggs) {
      if (egg.activated) continue;

      let matched = false;

      switch (egg.trigger.type) {
        case 'command':
          matched = this.matchCommand(egg.trigger.pattern as string, normalizedInput);
          break;

        case 'keyword':
          if (Array.isArray(egg.trigger.pattern)) {
            matched = (egg.trigger.pattern as string[]).some(k =>
              normalizedInput.includes(k.toLowerCase())
            );
          } else {
            matched = normalizedInput.includes((egg.trigger.pattern as string).toLowerCase());
          }
          break;

        case 'sequence':
          matched = this.matchSequence(egg.trigger.pattern as string[], normalizedInput);
          break;

        case 'random':
          matched = Math.random() < (egg.trigger.probability || 0.01);
          break;

        case 'combo':
          break;
      }

      if (matched) {
        return this.activateEgg(egg.id);
      }
    }

    return null;
  }

  triggerCombo(key: string): EasterEgg | null {
    const now = Date.now();
    const timeout = 3000;

    if (!this.comboState) {
      this.comboState = {
        keys: [key],
        startTime: now,
        lastKeyTime: now,
      };
      return null;
    }

    if (now - this.comboState.lastKeyTime > timeout) {
      this.comboState = {
        keys: [key],
        startTime: now,
        lastKeyTime: now,
      };
      return null;
    }

    this.comboState.keys.push(key);
    this.comboState.lastKeyTime = now;

    const comboString = this.comboState.keys.join(',');

    for (const [id, egg] of this.eggs) {
      if (egg.activated) continue;
      if (egg.trigger.type !== 'combo') continue;

      const comboKeys = egg.trigger.comboKeys || [];
      const inputCombo = this.comboState.keys.join(',');
      const expectedCombo = comboKeys.join(',');

      if (inputCombo === expectedCombo) {
        return this.activateEgg(egg.id);
      }
    }

    if (this.comboState.keys.length > 15) {
      this.comboState = null;
    }

    return null;
  }

  checkTimeTrigger(currentTime: Date): EasterEgg | null {
    const timeStr = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;

    for (const [id, egg] of this.eggs) {
      if (egg.activated) continue;
      if (egg.trigger.type !== 'time') continue;

      if (egg.trigger.pattern === timeStr) {
        return this.activateEgg(egg.id);
      }
    }

    return null;
  }

  checkCountTrigger(eventType: string): EasterEgg | null {
    for (const [id, egg] of this.eggs) {
      if (egg.activated) continue;
      if (egg.trigger.type !== 'count') continue;

      if (egg.trigger.pattern === eventType) {
        return this.activateEgg(egg.id);
      }
    }

    return null;
  }

  private activateEgg(eggId: string): EasterEgg | null {
    const egg = this.eggs.get(eggId);
    if (!egg || egg.activated) return null;

    egg.activated = true;
    egg.activatedAt = Date.now();

    this.stats.totalActivations++;
    this.stats.eggsPerRarity[egg.rarity]++;
    this.stats.currentStreak++;
    this.stats.longestStreak = Math.max(this.stats.longestStreak, this.stats.currentStreak);
    this.stats.lastActivation = Date.now();
    this.stats.discoveryTimestamps.push(Date.now());

    this.activationHistory.push(eggId);

    const listener = this.listeners.get(eggId);
    if (listener) {
      listener(egg);
    }

    return { ...egg };
  }

  private matchCommand(pattern: string, input: string): boolean {
    const normalizedInput = input.replace(/^\//, '').trim();
    return normalizedInput === pattern.toLowerCase();
  }

  private matchSequence(patterns: string[], input: string): boolean {
    const normalizedInput = input.toLowerCase();

    let lastIndex = 0;
    for (const pattern of patterns) {
      const index = normalizedInput.indexOf(pattern.toLowerCase(), lastIndex);
      if (index === -1) return false;
      lastIndex = index + pattern.length;
    }

    return true;
  }

  onActivate(eggId: string, callback: (egg: EasterEgg) => void): void {
    this.listeners.set(eggId, callback);
  }

  offActivate(eggId: string): void {
    this.listeners.delete(eggId);
  }

  getEgg(eggId: string): EasterEgg | undefined {
    return this.eggs.get(eggId);
  }

  getAllEggs(): EasterEgg[] {
    return Array.from(this.eggs.values());
  }

  getActivatedEggs(): EasterEgg[] {
    return Array.from(this.eggs.values()).filter(e => e.activated);
  }

  getUndiscoveredEggs(): EasterEgg[] {
    return Array.from(this.eggs.values()).filter(e => !e.activated);
  }

  getCollection(): EggCollection {
    const allEggs = this.getAllEggs();
    const activatedEggs = this.getActivatedEggs();

    const badges: Badge[] = activatedEggs
      .filter(e => e.reward?.type === 'badge')
      .map(e => ({
        id: e.reward!.value as string,
        name: e.name,
        description: e.description,
        icon: this.getBadgeIcon(e.reward!.value as string),
        earnedAt: e.activatedAt,
        rarity: e.rarity,
      }));

    return {
      totalEggs: allEggs.length,
      discoveredEggs: activatedEggs.length,
      undiscoveredEggs: allEggs.length - activatedEggs.length,
      rareEggs: allEggs.filter(e => e.rarity === 'rare' || e.rarity === 'legendary').length,
      legendaryEggs: allEggs.filter(e => e.rarity === 'legendary').length,
      badges,
      stats: { ...this.stats },
    };
  }

  private getBadgeIcon(badgeId: string): string {
    const icons: Record<string, string> = {
      konami_warrior: '🏆',
      golden_coder: '👑',
      lucky_star: '⭐',
      hacker_creds: '💻',
    };
    return icons[badgeId] || '🎖️';
  }

  reset(eggId?: string): void {
    if (eggId) {
      const egg = this.eggs.get(eggId);
      if (egg) {
        egg.activated = false;
        egg.activatedAt = undefined;
      }
    } else {
      for (const egg of this.eggs.values()) {
        egg.activated = false;
        egg.activatedAt = undefined;
      }
      this.activationHistory = [];
      this.stats = {
        totalActivations: 0,
        eggsPerRarity: { common: 0, uncommon: 0, rare: 0, legendary: 0 },
        longestStreak: 0,
        currentStreak: 0,
        discoveryTimestamps: [],
      };
    }
  }

  addCustomEgg(egg: Omit<EasterEgg, 'activated'>): void {
    this.registerEgg({ ...egg, activated: false });
  }
}

export function createEasterEggManager(): EasterEggManager {
  return new EasterEggManager();
}

export const easterEggMessages = {
  common: [
    '🎉 You found an easter egg!',
    '✨ Something magical happened!',
    '🎈 Hooray, a surprise!',
  ],
  uncommon: [
    '🌟 A rare discovery!',
    '💎 An uncommon treasure!',
    '🔮 Something mysterious awaits!',
  ],
  rare: [
    '🏆 Rare find!',
    '💫 You\'ve uncovered something special!',
    '🌈 A rare moment of joy!',
  ],
  legendary: [
    '👑 LEGENDARY!',
    '🌟🌟🌟 YOU ARE CHOSEN!',
    '⭐ The gods smile upon you!',
  ],
};
