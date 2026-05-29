export class Camera {
    x: number;        // world-space centre X
    y: number;        // world-space centre Y
    zoom: number;     // magnification (1 = natural)

    private worldW: number;
    private worldH: number;

    static readonly MIN_ZOOM = 0.4;
    static readonly MAX_ZOOM = 6.0;

    constructor(worldW: number, worldH: number) {
        this.worldW = worldW;
        this.worldH = worldH;
        this.x = worldW / 2;
        this.y = worldH / 2;
        this.zoom = 1;
    }

    // Apply the camera transform on top of the existing ctx transform
    // (which already has the resolutionScale baked in via resize()).
    // Call inside ctx.save() / ctx.restore().
    applyTo(ctx: CanvasRenderingContext2D, screenW: number, screenH: number) {
        // Pin the camera centre to the screen centre, then scale.
        ctx.translate(screenW / 2, screenH / 2);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.x, -this.y);
    }

    // Convert a CSS-pixel position on the canvas element to world-space coordinates.
    screenToWorld(
        clientX: number, clientY: number,
        canvas: HTMLCanvasElement,
        resolutionScale: number,
    ): { x: number; y: number } {
        const rect = canvas.getBoundingClientRect();
        // CSS pixels → physical canvas pixels
        const px = (clientX - rect.left) * (canvas.width / rect.width);
        const py = (clientY - rect.top) * (canvas.height / rect.height);
        // Physical → logical (undo resolutionScale)
        const lx = px / resolutionScale;
        const ly = py / resolutionScale;
        // Logical → world (undo camera)
        const wx = (lx - this.worldW / 2) / this.zoom + this.x;
        const wy = (ly - this.worldH / 2) / this.zoom + this.y;
        return { x: wx, y: wy };
    }

    // Pan by a screen-pixel delta (already in logical space if resolutionScale is 1).
    pan(dxPx: number, dyPx: number, resolutionScale: number) {
        this.x -= dxPx / resolutionScale / this.zoom;
        this.y -= dyPx / resolutionScale / this.zoom;
        this.clamp();
    }

    // Zoom toward a world-space anchor point so the point stays under the cursor.
    zoomTo(factor: number, anchorX: number, anchorY: number) {
        const newZoom = Math.max(Camera.MIN_ZOOM, Math.min(Camera.MAX_ZOOM, this.zoom * factor));
        const zoomChange = newZoom / this.zoom;
        // Adjust camera position to keep anchor fixed
        this.x = anchorX + (this.x - anchorX) / zoomChange;
        this.y = anchorY + (this.y - anchorY) / zoomChange;
        this.zoom = newZoom;
        this.clamp();
    }

    reset() {
        this.x = this.worldW / 2;
        this.y = this.worldH / 2;
        this.zoom = 1;
    }

    private clamp() {
        // Keep camera within world bounds (accounting for zoom).
        const halfW = this.worldW / 2 / this.zoom;
        const halfH = this.worldH / 2 / this.zoom;
        this.x = Math.max(halfW, Math.min(this.worldW - halfW, this.x));
        this.y = Math.max(halfH, Math.min(this.worldH - halfH, this.y));
    }
}
