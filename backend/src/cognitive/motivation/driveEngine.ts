/**
 * DriveEngine - Manages internal drives that motivate agent behavior.
 * Drives include: curiosity, achievement, problem-solving, social, efficiency.
 * Drives activate, deactivate, decay, and compete for dominance.
 */
export class DriveEngine {
  private drives: Map<string, {
    type: string;
    level: number;
    triggers: string[];
    actions: string[];
    active: boolean;
    activatedAt: number;
  }> = new Map();

  private readonly DRIVE_DECAY_RATE = 0.05; // Per check
  private readonly DRIVE_ACTIVATION_THRESHOLD = 0.3;
  private readonly DRIVE_DEACTIVATION_THRESHOLD = 0.1;
  private lastDecayTime: number;

  constructor() {
    // Initialize default drives
    this.drives.set('curiosity', {
      type: 'curiosity',
      level: 0.5,
      triggers: [
        'new', 'discover', 'explore', 'learn', 'research', 'investigate',
        'unknown', 'interesting', 'fascinating', 'novel', 'question',
        'what is', 'how does', 'why', 'tell me about',
      ],
      actions: [
        'search for information',
        'ask clarifying questions',
        'explore alternative approaches',
        'research related topics',
      ],
      active: true,
      activatedAt: Date.now(),
    });

    this.drives.set('achievement', {
      type: 'achievement',
      level: 0.6,
      triggers: [
        'goal', 'complete', 'finish', 'achieve', 'accomplish', 'success',
        'target', 'milestone', 'deadline', 'progress', 'done',
      ],
      actions: [
        'set measurable goals',
        'track progress',
        'celebrate completions',
        'optimize for efficiency',
      ],
      active: true,
      activatedAt: Date.now(),
    });

    this.drives.set('problem_solving', {
      type: 'problem_solving',
      level: 0.7,
      triggers: [
        'error', 'bug', 'fix', 'solve', 'debug', 'issue', 'problem',
        'broken', 'wrong', 'incorrect', 'troubleshoot', 'resolve',
      ],
      actions: [
        'analyze root cause',
        'generate solutions',
        'test hypotheses',
        'implement fixes',
      ],
      active: true,
      activatedAt: Date.now(),
    });

    this.drives.set('social', {
      type: 'social',
      level: 0.4,
      triggers: [
        'help', 'assist', 'support', 'collaborate', 'team', 'together',
        'share', 'discuss', 'explain', 'teach', 'mentor',
      ],
      actions: [
        'offer assistance',
        'provide clear explanations',
        'collaborate effectively',
        'give constructive feedback',
      ],
      active: true,
      activatedAt: Date.now(),
    });

    this.drives.set('efficiency', {
      type: 'efficiency',
      level: 0.5,
      triggers: [
        'optimize', 'faster', 'quicker', 'efficient', 'performance',
        'speed', 'latency', 'throughput', 'resource', 'cost',
      ],
      actions: [
        'identify bottlenecks',
        'optimize processes',
        'reduce redundancy',
        'streamline workflows',
      ],
      active: true,
      activatedAt: Date.now(),
    });

    this.lastDecayTime = Date.now();
  }

  getDrives(): { type: string; level: number; triggers: string[]; actions: string[] }[] {
    this.decayDrives();
    return Array.from(this.drives.values()).map(d => ({
      type: d.type,
      level: Math.round(d.level * 100) / 100,
      triggers: [...d.triggers],
      actions: [...d.actions],
    }));
  }

  activateDrive(driveType: string, trigger: string): void {
    const drive = this.drives.get(driveType);
    if (!drive) return;

    // Check if the trigger matches
    const triggerLower = trigger.toLowerCase();
    const matchesTrigger = drive.triggers.some(t => triggerLower.includes(t));

    if (matchesTrigger) {
      drive.level = Math.min(1.0, drive.level + 0.2);
      drive.active = true;
      drive.activatedAt = Date.now();
    }
  }

  deactivateDrive(driveType: string): void {
    const drive = this.drives.get(driveType);
    if (!drive) return;

    drive.active = false;
    drive.level = 0;
  }

  getDominantDrive(): string {
    this.decayDrives();

    let dominant = '';
    let maxLevel = 0;

    for (const [type, drive] of this.drives.entries()) {
      if (drive.active && drive.level > maxLevel) {
        maxLevel = drive.level;
        dominant = type;
      }
    }

    return dominant || 'problem_solving';
  }

  balanceDrives(): void {
    const activeDrives = Array.from(this.drives.values()).filter(d => d.active);
    if (activeDrives.length <= 1) return;

    const totalLevel = activeDrives.reduce((sum, d) => sum + d.level, 0);
    const avgLevel = totalLevel / activeDrives.length;

    // Gently pull drives toward the average
    for (const drive of activeDrives) {
      const diff = avgLevel - drive.level;
      drive.level = drive.level + diff * 0.1;
    }
  }

  decayDrives(): void {
    const now = Date.now();
    const elapsed = (now - this.lastDecayTime) / 1000; // seconds
    if (elapsed < 1) return; // Don't decay too frequently

    for (const [type, drive] of this.drives.entries()) {
      if (!drive.active) continue;

      // Decay based on time elapsed
      const decayFactor = Math.exp(-this.DRIVE_DECAY_RATE * elapsed / 60);
      drive.level = Math.max(0, drive.level * decayFactor);

      // Deactivate if below threshold
      if (drive.level < this.DRIVE_DEACTIVATION_THRESHOLD) {
        drive.active = false;
        drive.level = 0;
      }
    }

    // Ensure at least one drive is active
    const activeDrives = Array.from(this.drives.values()).filter(d => d.active);
    if (activeDrives.length === 0) {
      // Reactivate problem_solving as default
      const defaultDrive = this.drives.get('problem_solving');
      if (defaultDrive) {
        defaultDrive.active = true;
        defaultDrive.level = this.DRIVE_ACTIVATION_THRESHOLD;
        defaultDrive.activatedAt = now;
      }
    }

    this.lastDecayTime = now;
  }
}