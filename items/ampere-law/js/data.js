window.EMZoo = window.EMZoo || {};
window.EMZoo.itemData = {
    config: {
        width: 800, height: 500,
        xDomain: [-5, 5], yDomain: [-5, 5],
        accentColor: '#79c0ff',
        xLabel: 'x (m)', yLabel: 'y (m)',
        showAxes: true, showGrid: true
    },
    wire: { x: 0, y: 0, current: 1 },
    loopRadius: 2.0,
    mu0_over_2pi: 1,
    magneticField: function (x, y) {
        var dx = x - this.wire.x, dy = y - this.wire.y;
        var r2 = dx * dx + dy * dy;
        if (r2 < 0.04) return { x: 0, y: 0 };
        var Bx = -this.mu0_over_2pi * this.wire.current * dy / r2;
        var By =  this.mu0_over_2pi * this.wire.current * dx / r2;
        return { x: Bx, y: By };
    }
};
