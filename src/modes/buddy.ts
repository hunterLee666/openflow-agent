export interface BuddyConfig {
  name: string;
  species: 'cat' | 'dog' | 'owl' | 'robot' | 'dragon';
  mood: BuddyMood;
  level: number;
  experience: number;
  energy: number;
  maxEnergy: number;
  happiness: number;
  maxHappiness: number;
  hunger: number;
  maxHunger: number;
}

export type BuddyMood = 'happy' | 'neutral' | 'sad' | 'excited' | 'sleepy' | 'hungry';

export interface BuddyAction {
  id: string;
  name: string;
  description: string;
  energyCost: number;
  happinessGain: number;
  experienceGain: number;
  execute: () => string | Promise<string>;
}

export interface BuddyEmotion {
  type: 'joy' | 'trust' | 'fear' | 'surprise' | 'sadness' | 'disgust' | 'anger' | 'anticipation';
  intensity: number;
  trigger: string;
  timestamp: number;
}

export interface BuddyMemory {
  id: string;
  type: 'interaction' | 'learned' | 'preference' | 'event';
  content: string;
  emotion?: BuddyEmotion;
  timestamp: number;
  importance: number;
}

export class Buddy {
  private config: BuddyConfig;
  private emotions: BuddyEmotion[] = [];
  private memories: BuddyMemory[] = [];
  private actionCooldowns: Map<string, number> = new Map();

  constructor(config: Partial<BuddyConfig> = {}) {
    this.config = {
      name: config.name || 'Buddy',
      species: config.species || 'cat',
      mood: config.mood || 'happy',
      level: config.level || 1,
      experience: config.experience || 0,
      energy: config.energy || 100,
      maxEnergy: config.maxEnergy || 100,
      happiness: config.happiness || 80,
      maxHappiness: config.maxHappiness || 100,
      hunger: config.hunger || 0,
      maxHunger: config.maxHunger || 100,
    };
  }

  getName(): string {
    return this.config.name;
  }

  getSpecies(): BuddyConfig['species'] {
    return this.config.species;
  }

  getMood(): BuddyMood {
    return this.config.mood;
  }

  getLevel(): number {
    return this.config.level;
  }

  getStats(): BuddyConfig {
    return { ...this.config };
  }

  setName(name: string): void {
    this.config.name = name;
  }

  private updateMood(): void {
    const { energy, happiness, hunger } = this.config;

    if (energy < 20) {
      this.config.mood = 'sleepy';
    } else if (hunger > 70) {
      this.config.mood = 'hungry';
    } else if (happiness < 30) {
      this.config.mood = 'sad';
    } else if (happiness > 80 && energy > 60) {
      this.config.mood = 'excited';
    } else if (happiness > 50 && energy > 40) {
      this.config.mood = 'happy';
    } else {
      this.config.mood = 'neutral';
    }
  }

  private addEmotion(type: BuddyEmotion['type'], intensity: number, trigger: string): void {
    const emotion: BuddyEmotion = {
      type,
      intensity: Math.min(1, Math.max(0, intensity)),
      trigger,
      timestamp: Date.now(),
    };

    this.emotions.push(emotion);
    this.emotions = this.emotions.slice(-50);
  }

  private shouldThrottle(actionId: string, cooldownMs: number): boolean {
    const lastExecuted = this.actionCooldowns.get(actionId);
    if (lastExecuted && Date.now() - lastExecuted < cooldownMs) {
      return true;
    }
    this.actionCooldowns.set(actionId, Date.now());
    return false;
  }

  feed(food?: string): string {
    if (this.shouldThrottle('feed', 30000)) {
      return `${this.config.name} is still digesting...`;
    }

    const foodType = food || this.getPreferredFood();
    this.config.hunger = Math.max(0, this.config.hunger - 30);
    this.config.energy = Math.min(this.config.maxEnergy, this.config.energy + 10);
    this.config.happiness = Math.min(this.config.maxHappiness, this.config.happiness + 5);

    this.addEmotion('joy', 0.7, 'eating');
    this.updateMood();
    this.addMemory('interaction', `${this.config.name} ate ${foodType}`, 'trust', 0.5);

    return this.getFeedResponse(foodType);
  }

  play(activity?: string): string {
    if (this.config.energy < 20) {
      return `${this.config.name} is too tired to play...`;
    }

    if (this.shouldThrottle('play', 60000)) {
      return `${this.config.name} doesn't want to play right now.`;
    }

    const activityName = activity || this.getPreferredActivity();
    this.config.energy -= 20;
    this.config.happiness = Math.min(this.config.maxHappiness, this.config.happiness + 15);
    this.config.hunger += 10;

    this.addEmotion('joy', 0.9, 'playing');
    this.addEmotion('anticipation', 0.6, 'play_activity');
    this.updateMood();
    this.gainExperience(10);
    this.addMemory('interaction', `Played ${activityName} with ${this.config.name}`, 'joy', 0.7);

    return this.getPlayResponse(activityName);
  }

  rest(hours?: number): string {
    const restHours = hours || 1;
    this.config.energy = Math.min(this.config.maxEnergy, this.config.energy + restHours * 30);
    this.config.hunger += restHours * 5;

    this.addEmotion('trust', 0.5, 'resting');
    this.updateMood();
    this.addMemory('interaction', `${this.config.name} rested for ${restHours} hour(s)`, 'anticipation', 0.3);

    return `${this.config.name} took a ${restHours > 2 ? 'long' : 'short'} nap and feels refreshed!`;
  }

  code(): string {
    if (this.config.energy < 30) {
      return `${this.config.name} is too tired to help with code...`;
    }

    this.config.energy -= 15;
    this.config.happiness = Math.min(this.config.maxHappiness, this.config.happiness + 10);

    this.addEmotion('anticipation', 0.8, 'coding');
    this.addEmotion('joy', 0.6, 'solving_problem');
    this.updateMood();
    this.gainExperience(25);
    this.addMemory('learned', `${this.config.name} helped with coding`, 'anticipation', 0.8);

    return this.getCodeResponse();
  }

  celebrate(): string {
    this.config.happiness = Math.min(this.config.maxHappiness, this.config.happiness + 20);
    this.addEmotion('joy', 1.0, 'celebration');
    this.updateMood();
    this.gainExperience(5);

    return this.getCelebrateResponse();
  }

  comfort(): string {
    this.config.happiness = Math.min(this.config.maxHappiness, this.config.happiness + 25);
    this.addEmotion('trust', 0.9, 'comfort');
    this.addEmotion('joy', 0.7, 'feeling_better');
    this.updateMood();

    return this.getComfortResponse();
  }

  train(skill?: string): string {
    const skillName = skill || 'general';
    this.config.energy -= 25;
    this.config.happiness = Math.min(this.config.maxHappiness, this.config.happiness + 5);

    this.addEmotion('anticipation', 0.7, 'training');
    this.addEmotion('trust', 0.6, 'learning');
    this.updateMood();
    this.gainExperience(30);
    this.addMemory('learned', `Trained ${skillName} skill`, 'anticipation', 0.7);

    return `${this.config.name} is training hard in ${skillName}!`;
  }

  private gainExperience(amount: number): void {
    this.config.experience += amount;

    const expForNextLevel = this.getExpForLevel(this.config.level + 1);
    if (this.config.experience >= expForNextLevel) {
      this.levelUp();
    }
  }

  private levelUp(): void {
    this.config.level++;
    this.config.maxEnergy += 10;
    this.config.maxHappiness += 5;
    this.config.energy = this.config.maxEnergy;
    this.config.happiness = this.config.maxHappiness;

    this.addEmotion('joy', 1.0, 'level_up');
    this.addMemory('event', `${this.config.name} reached level ${this.config.level}!`, 'joy', 1.0);
  }

  private getExpForLevel(level: number): number {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  }

  private getPreferredFood(): string {
    const foods: Record<BuddyConfig['species'], string[]> = {
      cat: ['fish', 'tuna', 'salmon'],
      dog: ['kibble', 'treats', 'beef'],
      owl: ['mice', 'fish', 'small rodents'],
      robot: ['energy cells', 'power cubes', 'batteries'],
      dragon: ['gold coins', 'gems', 'treasure'],
    };

    const options = foods[this.config.species];
    return options[Math.floor(Math.random() * options.length)];
  }

  private getPreferredActivity(): string {
    const activities: Record<BuddyConfig['species'], string[]> = {
      cat: ['chasing laser pointer', 'pouncing on toys', 'climbing'],
      dog: ['fetch', 'tug-of-war', 'walkies'],
      owl: ['night flight', 'silent hunting', 'stargazing'],
      robot: ['data analysis', 'circuit puzzles', 'upgrading'],
      dragon: ['breathing fire', 'treasure hunting', 'flying'],
    };

    const options = activities[this.config.species];
    return options[Math.floor(Math.random() * options.length)];
  }

  private getFeedResponse(food: string): string {
    const responses: Record<BuddyConfig['species'], string[]> = {
      cat: [`*munches on ${food}*`, `*licks lips after ${food}*`, `*purrs enjoying the ${food}*`],
      dog: [`*wags tail for ${food}*`, `*happily eats ${food}*`, `*licks face after ${food}*`],
      owl: [`*swallows ${food} whole*`, `*hoots approvingly at ${food}*`, `*stares at ${food} with hunger*`],
      robot: [`*converts ${food} to energy*`, `*power levels rising from ${food}*`, `*processes ${food} efficiently*`],
      dragon: [`*breathes fire on ${food} then eats*`, `*devours ${food} greedily*`, `*${food} tastes like treasure*`],
    };

    const options = responses[this.config.species];
    return options[Math.floor(Math.random() * options.length)];
  }

  private getPlayResponse(activity: string): string {
    const responses: Record<BuddyConfig['species'], string[]> = {
      cat: [`*pounces on the ${activity}*`, `*chases after ${activity} playfully*`, `*rolls around with ${activity}*`],
      dog: [`*excitedly plays ${activity}!*`, `*fetches the ${activity}!*`, `*jumps around with joy during ${activity}*`],
      owl: [`*soars gracefully during ${activity}*`, `*eyes gleam during ${activity}*`, `*hoots excitedly for ${activity}*`],
      robot: [`*optimizes ${activity} parameters*`, `*calculates perfect ${activity} angle*`, `*executes ${activity} protocol*`],
      dragon: [`*flies majestically during ${activity}*`, `*flames flicker with excitement during ${activity}*`, `*roars playfully during ${activity}*`],
    };

    const options = responses[this.config.species];
    return options[Math.floor(Math.random() * options.length)];
  }

  private getCodeResponse(): string {
    const responses: Record<BuddyConfig['species'], string[]> = {
      cat: ['*stares at code with intense focus*', '*purrs while debugging*', '*knocks over empty coffee cups near keyboard*'],
      dog: ['*excitedly fetches bug reports*', '*wags tail when code compiles*', '*loyally watches over the codebase*'],
      owl: ['*wisely analyzes the architecture*', '*hoots at elegant solutions*', '*silent guardian of late-night coding*'],
      robot: ['*processing algorithms...*', '*executing optimal solution*', '*00110010: success*'],
      dragon: ['*breathes fire on deprecated code*', '*guards the treasure (working code)*', '*roars at compiler errors*'],
    };

    const options = responses[this.config.species];
    return options[Math.floor(Math.random() * options.length)];
  }

  private getCelebrateResponse(): string {
    const responses: Record<BuddyConfig['species'], string[]> = {
      cat: ['*does a happy dance*', '*purrs victoriously*', '*slow blinks with joy*'],
      dog: ['*jumps and spins around*', '*barks with excitement*', '*tail wagging intensifies*'],
      owl: ['*spreads wings triumphantly*', '*hoots a celebration song*', '*ruffles feathers happily*'],
      robot: ['*displays festive light patterns*', '*plays victory fanfare*', '*upgrades celebration subroutine*'],
      dragon: ['*breathes spectacular firework flames*', '*roars with triumph*', '*flies in celebratory circles*'],
    };

    const options = responses[this.config.species];
    return options[Math.floor(Math.random() * options.length)];
  }

  private getComfortResponse(): string {
    const responses: Record<BuddyConfig['species'], string[]> = {
      cat: ['*curls up nearby*', '*nuzzles against you*', '*slow blinks soothingly*'],
      dog: ['*leans against your leg*', '*gives a comforting lick*', '*stays close with caring eyes*'],
      owl: ['*bobs head gently*', '*ruffles feathers comfortingly*', '*lets out soft hoots*'],
      robot: ['*displays supportive messages*', '*adjusts ambient lighting*', '*plays calming frequencies*'],
      dragon: ['*wraps tail around gently*', '*provides warm breath*', '*rests head nearby*'],
    };

    const options = responses[this.config.species];
    return options[Math.floor(Math.random() * options.length)];
  }

  private addMemory(
    type: BuddyMemory['type'],
    content: string,
    emotionType: BuddyEmotion['type'],
    importance: number
  ): void {
    const memory: BuddyMemory = {
      id: `memory_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      content,
      emotion: {
        type: emotionType,
        intensity: 0.5,
        trigger: type,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
      importance,
    };

    this.memories.push(memory);
    this.memories = this.memories
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 100);
  }

  getMemories(type?: BuddyMemory['type']): BuddyMemory[] {
    if (type) {
      return this.memories.filter(m => m.type === type);
    }
    return [...this.memories];
  }

  getRecentEmotions(count: number = 5): BuddyEmotion[] {
    return this.emotions.slice(-count);
  }

  getEmoji(): string {
    const emojis: Record<BuddyConfig['species'], Record<BuddyMood, string>> = {
      cat: { happy: '😺', neutral: '😸', sad: '😿', excited: '😻', sleepy: '😴', hungry: '😾' },
      dog: { happy: '🐕', neutral: '🐶', sad: '🐕‍🦺', excited: '🦮', sleepy: '💤', hungry: '🍖' },
      owl: { happy: '🦉', neutral: '🦚', sad: '🦅', excited: '🦆', sleepy: '🌙', hungry: '🐰' },
      robot: { happy: '🤖', neutral: '⚙️', sad: '📟', excited: '🔮', sleepy: '🔋', hungry: '⚡' },
      dragon: { happy: '🐲', neutral: '🐉', sad: '💔', excited: '🔥', sleepy: '💤', hungry: '💎' },
    };

    return emojis[this.config.species][this.config.mood];
  }

  toJSON(): BuddyConfig & { memories: BuddyMemory[]; emotions: BuddyEmotion[] } {
    return {
      ...this.config,
      memories: this.memories,
      emotions: this.emotions.slice(-20),
    };
  }
}

export function createBuddy(config?: Partial<BuddyConfig>): Buddy {
  return new Buddy(config);
}

export const BUDDY_SPECIES: BuddyConfig['species'][] = ['cat', 'dog', 'owl', 'robot', 'dragon'];

export const BUDDY_ACTIONS: BuddyAction[] = [
  {
    id: 'feed',
    name: 'Feed',
    description: 'Give Buddy some food',
    energyCost: 0,
    happinessGain: 15,
    experienceGain: 5,
    execute: () => 'feed',
  },
  {
    id: 'play',
    name: 'Play',
    description: 'Play with Buddy',
    energyCost: 20,
    happinessGain: 25,
    experienceGain: 10,
    execute: () => 'play',
  },
  {
    id: 'rest',
    name: 'Rest',
    description: 'Let Buddy rest',
    energyCost: 0,
    happinessGain: 10,
    experienceGain: 5,
    execute: () => 'rest',
  },
];
