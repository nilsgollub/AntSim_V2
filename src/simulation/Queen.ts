import { CONFIG } from '../config';
import { World } from './World';

export class Queen {
    x: number;
    y: number;
    proteinStored: number;
    eggTimer: number;

    constructor() {
        this.x = CONFIG.queenPosition.x;
        this.y = CONFIG.queenPosition.y;
        this.proteinStored = 0;
        this.eggTimer = 0;
    }

    update(world: World) {
        // Eat protein if available in nest (abstracted via world interaction or direct feeding)
        // For now, we assume workers deliver directly to the colony "stockpile" which the queen accesses

        // Lay eggs
        if (world.proteinStockpile >= CONFIG.eggCost) {
            this.eggTimer++;
            if (this.eggTimer > 100) { // Delay between eggs
                world.proteinStockpile -= CONFIG.eggCost;
                world.spawnBrood();
                this.eggTimer = 0;
            }
        }
    }
}
