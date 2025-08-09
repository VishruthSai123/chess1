export type BestMove = {
  move: string; // UCI like e2e4 or e7e8q
  ponder?: string;
};

export class StockfishEngine {
  private worker: Worker | null = null;
  private isReady = false;
  private pendingInit: Promise<void> | null = null;
  private currentSkillLevel = 20;
  // Track whether we had to fall back to single-threaded build (useful for future diagnostics)
  private isSingleThreaded = false;
  get usingSingleThreaded(): boolean { return this.isSingleThreaded; }

  initialize(): Promise<void> {
    if (this.pendingInit) return this.pendingInit;

    this.pendingInit = new Promise<void>((resolve) => {
      const initializeWorker = (scriptUrl: string, singleThreaded: boolean) => {
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
        this.worker = new Worker(scriptUrl);
        this.isSingleThreaded = singleThreaded;

        const timeout = setTimeout(() => {
          // Fallback if uciok never arrives (e.g., missing COOP/COEP)
          if (!this.isReady && !singleThreaded) {
            initializeWorker('/stockfish/stockfish-nnue-16-single.js', true);
          }
        }, 2500);

        const handleError = () => {
          if (!singleThreaded) {
            initializeWorker('/stockfish/stockfish-nnue-16-single.js', true);
          }
        };

        const handleMessage = (e: MessageEvent) => {
          const text: string = typeof e.data === 'string' ? e.data : '';
          if (!text) return;

          if (text.includes('uciok')) {
            this.worker!.postMessage('isready');
          } else if (text.includes('readyok')) {
            clearTimeout(timeout);
            this.isReady = true;
            this.worker!.removeEventListener('message', handleMessage);
            this.worker!.removeEventListener('error', handleError as any);
            resolve();
          }
        };

        this.worker.addEventListener('message', handleMessage);
        this.worker.addEventListener('error', handleError as any);

        // Kick off UCI
        this.worker.postMessage('uci');
        this.worker.postMessage('ucinewgame');
        // Reasonable defaults
        const cores = typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency ? (navigator as any).hardwareConcurrency : 2;
        const threads = singleThreaded ? 1 : Math.max(1, Math.min(cores, 8));
        this.worker.postMessage(`setoption name Threads value ${threads}`);
        this.worker.postMessage(`setoption name Skill Level value ${this.currentSkillLevel}`);
        this.worker.postMessage('setoption name Ponder value false');
      };

      // Try multi-threaded first; fall back automatically
      initializeWorker('/stockfish/stockfish-nnue-16.js', false);
    });

    return this.pendingInit;
  }

  async getBestMove(fen: string, options?: { movetimeMs?: number; depth?: number }): Promise<BestMove> {
    if (!this.worker) await this.initialize();
    if (!this.worker) throw new Error('Stockfish worker failed to initialize');

    if (!this.isReady) await this.pendingInit;

    return new Promise<BestMove>((resolve) => {
      const onMessage = (e: MessageEvent) => {
        const text: string = typeof e.data === 'string' ? e.data : '';
        if (!text) return;
        // Example: "bestmove e2e4 ponder e7e5"
        if (text.startsWith('bestmove')) {
          const parts = text.trim().split(/\s+/);
          const result: BestMove = { move: parts[1] };
          const ponderIdx = parts.indexOf('ponder');
          if (ponderIdx !== -1 && parts[ponderIdx + 1]) {
            result.ponder = parts[ponderIdx + 1];
          }
          this.worker!.removeEventListener('message', onMessage);
          resolve(result);
        }
      };

      this.worker!.addEventListener('message', onMessage);

      // Tell engine the current position and start searching
      this.worker!.postMessage(`position fen ${fen}`);
      if (options?.depth) {
        this.worker!.postMessage(`go depth ${options.depth}`);
      } else {
        const movetime = options?.movetimeMs ?? 500;
        // Do NOT append 'ponder' to 'go' unless using ponderhit; it will never return bestmove.
        this.worker!.postMessage(`go movetime ${movetime}`);
      }
    });
  }

  setSkillLevel(level: number) {
    this.currentSkillLevel = Math.max(0, Math.min(20, Math.floor(level)));
    if (this.worker && this.isReady) {
      this.worker.postMessage(`setoption name Skill Level value ${this.currentSkillLevel}`);
    }
  }

  setHashSize(mb: number) {
    const clamped = Math.max(16, Math.min(4096, Math.floor(mb)));
    if (this.worker && this.isReady) {
      this.worker.postMessage(`setoption name Hash value ${clamped}`);
    }
  }

  setOption(name: string, value: string | number) {
    if (!this.worker) return;
    this.worker.postMessage(`setoption name ${name} value ${value}`);
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isReady = false;
      this.pendingInit = null;
    }
  }
}


