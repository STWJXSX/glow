export function isLockerPerfEnabled(): boolean {

  const v = process.env.LOCKER_PERF;

  return v === '1' || v === 'true' || v === 'yes';

}



export class LockerPerf {

  private lapStart = performance.now();

  private readonly started = performance.now();

  private readonly laps: Array<{ name: string; ms: number }> = [];

  private readonly details: Array<{ name: string; ms: number }> = [];



  private readonly scope: string;

  constructor(scope: string) {
    this.scope = scope;
  }



  lap(name: string): void {

    if (!isLockerPerfEnabled()) return;

    const now = performance.now();

    this.laps.push({ name, ms: now - this.lapStart });

    this.lapStart = now;

  }



  record(name: string, ms: number): void {

    if (!isLockerPerfEnabled()) return;

    this.laps.push({ name, ms });

  }



  /** Sub-metrics (CPU-sum across parallel workers) — not in wall-clock %. */

  detail(name: string, ms: number): void {

    if (!isLockerPerfEnabled()) return;

    this.details.push({ name, ms });

  }



  flush(): void {

    if (!isLockerPerfEnabled()) return;

    const wallMs = performance.now() - this.started;

    const sorted = [...this.laps].sort((a, b) => b.ms - a.ms);

    console.log(`[locker-perf] ${this.scope} — ${(wallMs / 1000).toFixed(2)}s wall`);

    for (const { name, ms } of sorted) {

      const pct = wallMs > 0 ? ((ms / wallMs) * 100).toFixed(1) : '0.0';

      console.log(`  ${(ms / 1000).toFixed(3)}s  (${pct}%)  ${name}`);

    }

    if (this.details.length) {

      const sortedDetails = [...this.details].sort((a, b) => b.ms - a.ms);

      console.log('  --- detail (CPU-sum, parallel) ---');

      for (const { name, ms } of sortedDetails) {

        console.log(`  ${(ms / 1000).toFixed(3)}s  ${name}`);

      }

    }

  }

}


