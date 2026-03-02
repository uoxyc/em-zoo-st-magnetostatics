window.EMZoo = window.EMZoo || {};
window.EMZoo.itemData = {
    config: {
        width: 800, height: 500,
        xDomain: [-5, 5], yDomain: [-5, 5],
        accentColor: '#79c0ff',
        xLabel: 'x (m)', yLabel: 'y (m)',
        showAxes: true, showGrid: true
    },
    wires: [{ x: 0, y: 0, current: 1, direction: 'out' }],
    mu0_over_4pi: 1,
    magneticField: function (x, y) {
        var Bx = 0, By = 0;
        for (var i = 0; i < this.wires.length; i++) {
            var w = this.wires[i];
            var dx = x - w.x, dy = y - w.y;
            var r2 = dx * dx + dy * dy;
            if (r2 < 0.04) continue;
            var sign = w.direction === 'out' ? 1 : -1;
            var I = sign * w.current;
            Bx += -this.mu0_over_4pi * I * dy / r2;
            By +=  this.mu0_over_4pi * I * dx / r2;
        }
        return { x: Bx, y: By };
    }
};
