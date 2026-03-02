/* ============================================================
   Electrodynamics Fields & Waves Zoo — D3 v7 Diagram Scaffold
   ============================================================
   Core visualization module for electromagnetic field diagrams.
   Replaces ML-focused scatter/regression primitives with EM
   field visualization primitives: vector fields, field lines,
   equipotentials, charges, waves, particle trajectories, wires,
   and geometric surfaces.

   Namespace : window.EMZoo.diagram
   Pattern   : IIFE module with public API at bottom
   Depends   : D3.js v7 (CDN)

   Public API
   ----------
   init(containerSelector, cfg)
   drawVectorField(fieldFn, opts)
   drawFieldLines(sources, opts)
   drawEquipotentials(potentialFn, opts)
   drawCharges(charges, opts)
   drawWave(params, opts)
   drawParticleTrajectory(trajectory, opts)
   drawCurrentWire(points, opts)
   drawCircle(cx, cy, r, opts)
   clear()
   resetZoom()
   getScales()
   getGroup()
   getSvg()
   showTooltip(event, text)
   hideTooltip()
   ============================================================ */
(function () {
    'use strict';

    /* ==========================================================
       Module State
       ========================================================== */

    var svg, g, defs, width, height, xScale, yScale, zoom;
    var config = {};
    var margin = { top: 20, right: 30, bottom: 45, left: 55 };
    var animationFrameIds = [];
    var instanceId = 'em-' + Math.random().toString(36).substr(2, 6);

    /* ==========================================================
       Constants
       ========================================================== */

    var DEFAULT_ACCENT   = '#58a6ff';
    var POSITIVE_COLOR   = '#e05050';
    var NEGATIVE_COLOR   = '#4a90d9';
    var FIELD_LINE_COLOR = '#c0c0c0';
    var EQUIP_COLOR      = '#888888';

    /* Minimum distance squared to a charge before we stop tracing */
    var CHARGE_STOP_R2 = 0.04;

    /* ==========================================================
       init(containerSelector, cfg)
       ----------------------------------------------------------
       Creates SVG with viewBox, optional axes and grid, clip
       path, arrowhead marker defs, and zoom/pan behaviour.

       cfg keys:
         width, height       — SVG dimensions (px)
         xDomain, yDomain    — [min, max] data ranges
         xLabel, yLabel      — axis label strings
         accentColor          — default colour for primitives
         showAxes (bool)      — render axes (default true)
         showGrid (bool)      — render background grid (true)
       ========================================================== */

    function init(containerSelector, cfg) {
        config = cfg || {};
        var container = document.querySelector(containerSelector);
        if (!container) return;

        /* Cancel any running animations from a previous init */
        _cancelAnimations();

        width  = config.width  || container.clientWidth || 800;
        height = config.height || 500;

        var showAxes = config.showAxes !== undefined ? config.showAxes : true;
        var showGrid = config.showGrid !== undefined ? config.showGrid : true;

        svg = d3.select(containerSelector)
            .append('svg')
            .attr('viewBox', '0 0 ' + width + ' ' + height)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('width', '100%')
            .style('max-height', height + 'px');

        /* ---- Defs: clip path + arrowhead markers ---- */

        defs = svg.append('defs');

        defs.append('clipPath')
            .attr('id', instanceId + '-clip')
            .append('rect')
            .attr('x', margin.left)
            .attr('y', margin.top)
            .attr('width', width - margin.left - margin.right)
            .attr('height', height - margin.top - margin.bottom);

        /* Standard arrowhead marker (inherits stroke colour) */
        _defineArrowMarker(instanceId + '-arrow', 6, 4, 'context-stroke');

        /* Content group clipped to plot area */
        g = svg.append('g').attr('clip-path', 'url(#' + instanceId + '-clip)');

        /* ---- Scales ---- */

        var xDomain = config.xDomain || [-5, 5];
        var yDomain = config.yDomain || [-5, 5];

        xScale = d3.scaleLinear()
            .domain(xDomain)
            .range([margin.left, width - margin.right]);

        yScale = d3.scaleLinear()
            .domain(yDomain)
            .range([height - margin.bottom, margin.top]);

        /* ---- Grid ---- */

        if (showGrid) {
            var xGrid = svg.append('g')
                .attr('class', 'em-grid em-grid-x')
                .attr('transform', 'translate(0,' + (height - margin.bottom) + ')')
                .call(d3.axisBottom(xScale).ticks(10)
                    .tickSize(-(height - margin.top - margin.bottom))
                    .tickFormat(''));
            xGrid.attr('opacity', 0.08).select('.domain').remove();

            var yGrid = svg.append('g')
                .attr('class', 'em-grid em-grid-y')
                .attr('transform', 'translate(' + margin.left + ',0)')
                .call(d3.axisLeft(yScale).ticks(8)
                    .tickSize(-(width - margin.left - margin.right))
                    .tickFormat(''));
            yGrid.attr('opacity', 0.08).select('.domain').remove();
        }

        /* ---- Axes ---- */

        if (showAxes) {
            var axisColor = _getCssVar('--text-muted') || '#6e7681';

            svg.append('g')
                .attr('class', 'em-x-axis')
                .attr('transform', 'translate(0,' + (height - margin.bottom) + ')')
                .call(d3.axisBottom(xScale).ticks(10))
                .selectAll('text,line,path')
                .attr('stroke', axisColor).attr('fill', axisColor);

            svg.append('g')
                .attr('class', 'em-y-axis')
                .attr('transform', 'translate(' + margin.left + ',0)')
                .call(d3.axisLeft(yScale).ticks(8))
                .selectAll('text,line,path')
                .attr('stroke', axisColor).attr('fill', axisColor);

            if (config.xLabel) {
                svg.append('text')
                    .attr('class', 'em-axis-label')
                    .attr('x', width / 2).attr('y', height - 5)
                    .attr('text-anchor', 'middle')
                    .attr('fill', axisColor).attr('font-size', '12px')
                    .text(config.xLabel);
            }
            if (config.yLabel) {
                svg.append('text')
                    .attr('class', 'em-axis-label')
                    .attr('x', -height / 2).attr('y', 15)
                    .attr('transform', 'rotate(-90)')
                    .attr('text-anchor', 'middle')
                    .attr('fill', axisColor).attr('font-size', '12px')
                    .text(config.yLabel);
            }
        }

        /* ---- Zoom / Pan ---- */

        zoom = d3.zoom()
            .scaleExtent([0.3, 8])
            .on('zoom', function (event) {
                g.attr('transform', event.transform);
            });
        svg.call(zoom);
    }

    /* ==========================================================
       drawVectorField(fieldFn, opts)
       ----------------------------------------------------------
       Draws an arrow grid showing E or B field at sample points.

       fieldFn(x, y) -> { x: Fx, y: Fy }

       opts:
         resolution  — grid points per axis (default 15)
         color       — arrow colour
         maxLength   — max arrow length in px (default 20)
         opacity     — arrow opacity (default 0.7)
         animated    — animate entrance (bool, default false)
       ========================================================== */

    function drawVectorField(fieldFn, opts) {
        opts = opts || {};
        var res       = opts.resolution || 15;
        var color     = opts.color || config.accentColor || DEFAULT_ACCENT;
        var maxLen    = opts.maxLength || 20;
        var opacity   = opts.opacity !== undefined ? opts.opacity : 0.7;
        var animated  = opts.animated || false;

        g.selectAll('.em-vector').remove();

        var xd = xScale.domain();
        var yd = yScale.domain();
        var dx = (xd[1] - xd[0]) / (res - 1);
        var dy = (yd[1] - yd[0]) / (res - 1);

        /* Create a custom-coloured arrowhead for this invocation */
        var markerId = instanceId + '-varrow-' + color.replace(/[^a-zA-Z0-9]/g, '');
        _defineArrowMarker(markerId, 6, 4, color);

        var arrows = [];
        for (var i = 0; i < res; i++) {
            for (var j = 0; j < res; j++) {
                var px = xd[0] + i * dx;
                var py = yd[0] + j * dy;
                var field = fieldFn(px, py);
                if (!field || (!isFinite(field.x)) || (!isFinite(field.y))) continue;

                var mag = Math.sqrt(field.x * field.x + field.y * field.y);
                if (mag < 1e-12) continue;

                /* Scale arrow length proportional to magnitude, capped at maxLen */
                var scale = Math.min(mag, maxLen) / mag;
                /* Convert field direction to pixel offsets */
                var pxStart = xScale(px);
                var pyStart = yScale(py);
                /* We want arrows centred at the grid point */
                var adx = (xScale(px + field.x * scale) - pxStart);
                var ady = (yScale(py + field.y * scale) - pyStart);
                /* Cap pixel length */
                var pxLen = Math.sqrt(adx * adx + ady * ady);
                if (pxLen > maxLen) {
                    adx = adx / pxLen * maxLen;
                    ady = ady / pxLen * maxLen;
                }

                arrows.push({
                    x1: pxStart - adx * 0.5,
                    y1: pyStart - ady * 0.5,
                    x2: pxStart + adx * 0.5,
                    y2: pyStart + ady * 0.5,
                    mag: mag
                });
            }
        }

        var sel = g.selectAll('.em-vector')
            .data(arrows)
            .enter()
            .append('line')
            .attr('class', 'em-vector')
            .attr('x1', function (d) { return d.x1; })
            .attr('y1', function (d) { return d.y1; })
            .attr('x2', animated ? function (d) { return d.x1; } : function (d) { return d.x2; })
            .attr('y2', animated ? function (d) { return d.y1; } : function (d) { return d.y2; })
            .attr('stroke', color)
            .attr('stroke-width', 1.5)
            .attr('marker-end', 'url(#' + markerId + ')')
            .attr('opacity', animated ? 0 : opacity);

        if (animated) {
            sel.transition()
                .duration(500)
                .delay(function (d, i) { return i * 5; })
                .attr('x2', function (d) { return d.x2; })
                .attr('y2', function (d) { return d.y2; })
                .attr('opacity', opacity);
        }
    }

    /* ==========================================================
       drawFieldLines(sources, opts)
       ----------------------------------------------------------
       Streamlines via RK4 integration from point charges.

       sources: [{ x, y, q }]

       opts:
         color      — line colour
         numLines   — lines per charge (default 12)
         stepSize   — RK4 step in data coords (default 0.05)
         maxSteps   — max integration steps (default 500)
         lineWidth  — stroke width (default 1.5)
         animate    — dash animation (bool, default false)
       ========================================================== */

    function drawFieldLines(sources, opts) {
        opts = opts || {};
        var color    = opts.color || FIELD_LINE_COLOR;
        var numLines = opts.numLines || 12;
        var stepSize = opts.stepSize || 0.05;
        var maxSteps = opts.maxSteps || 500;
        var lineW    = opts.lineWidth || 1.5;
        var animate  = opts.animate || false;

        g.selectAll('.em-field-line').remove();

        if (!sources || sources.length === 0) return;

        /* Build the composite E-field function */
        var fieldFn = _compositeElectricField(sources);

        /* For each charge, launch field lines from a small circle around it */
        var allPaths = [];
        sources.forEach(function (src) {
            if (Math.abs(src.q) < 1e-12) return;
            var direction = src.q > 0 ? 1 : -1;
            var startRadius = 0.15;

            for (var k = 0; k < numLines; k++) {
                var angle = (2 * Math.PI * k) / numLines;
                var sx = src.x + startRadius * Math.cos(angle);
                var sy = src.y + startRadius * Math.sin(angle);

                var path = _traceFieldLine(fieldFn, sources, sx, sy, direction, stepSize, maxSteps);
                if (path.length > 1) {
                    allPaths.push(path);
                }
            }
        });

        /* Draw each path */
        var lineGen = d3.line()
            .x(function (d) { return xScale(d.x); })
            .y(function (d) { return yScale(d.y); })
            .curve(d3.curveCatmullRom.alpha(0.5));

        var sel = g.selectAll('.em-field-line')
            .data(allPaths)
            .enter()
            .append('path')
            .attr('class', 'em-field-line')
            .attr('d', function (d) { return lineGen(d); })
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', lineW)
            .attr('opacity', 0.6);

        if (animate) {
            sel.each(function () {
                var pathEl = d3.select(this);
                var totalLen = this.getTotalLength();
                pathEl
                    .attr('stroke-dasharray', totalLen + ' ' + totalLen)
                    .attr('stroke-dashoffset', totalLen)
                    .transition()
                    .duration(1200)
                    .ease(d3.easeLinear)
                    .attr('stroke-dashoffset', 0);
            });
        }
    }

    /* ==========================================================
       drawEquipotentials(potentialFn, opts)
       ----------------------------------------------------------
       Contour lines using marching squares.

       potentialFn(x, y) -> scalar V

       opts:
         levels     — array of V values (default auto 10 levels)
         color      — line colour
         opacity    — line opacity (default 0.5)
         lineWidth  — stroke width (default 1)
         resolution — grid resolution for sampling (default 80)
       ========================================================== */

    function drawEquipotentials(potentialFn, opts) {
        opts = opts || {};
        var color  = opts.color || EQUIP_COLOR;
        var opac   = opts.opacity !== undefined ? opts.opacity : 0.5;
        var lineW  = opts.lineWidth || 1;
        var res    = opts.resolution || 80;

        g.selectAll('.em-equipotential').remove();

        var xd = xScale.domain();
        var yd = yScale.domain();
        var dx = (xd[1] - xd[0]) / res;
        var dy = (yd[1] - yd[0]) / res;

        /* Sample the potential on a grid */
        var grid = [];
        for (var j = 0; j <= res; j++) {
            var row = [];
            for (var i = 0; i <= res; i++) {
                var px = xd[0] + i * dx;
                var py = yd[0] + j * dy;
                var val = potentialFn(px, py);
                /* Clamp extreme values near charges */
                row.push(Math.max(-1e6, Math.min(1e6, val)));
            }
            grid.push(row);
        }

        /* Determine levels */
        var levels = opts.levels;
        if (!levels) {
            /* Auto-generate levels from the data range */
            var allVals = [];
            for (var rr = 0; rr < grid.length; rr++) {
                for (var cc = 0; cc < grid[rr].length; cc++) {
                    var v = grid[rr][cc];
                    if (isFinite(v) && Math.abs(v) < 1e5) allVals.push(v);
                }
            }
            allVals.sort(function (a, b) { return a - b; });
            var numLevels = 10;
            levels = [];
            for (var ll = 1; ll <= numLevels; ll++) {
                var idx = Math.floor(ll * allVals.length / (numLevels + 1));
                levels.push(allVals[Math.min(idx, allVals.length - 1)]);
            }
        }

        /* Run marching squares for each level */
        levels.forEach(function (threshold) {
            var segments = _marchingSquares(grid, threshold, xd, yd, dx, dy);
            if (segments.length === 0) return;

            segments.forEach(function (seg) {
                g.append('line')
                    .attr('class', 'em-equipotential')
                    .attr('x1', xScale(seg.x1))
                    .attr('y1', yScale(seg.y1))
                    .attr('x2', xScale(seg.x2))
                    .attr('y2', yScale(seg.y2))
                    .attr('stroke', color)
                    .attr('stroke-width', lineW)
                    .attr('opacity', opac);
            });
        });
    }

    /* ==========================================================
       drawCharges(charges, opts)
       ----------------------------------------------------------
       Render point charges with + / - symbols.

       charges: [{ x, y, q }]

       opts:
         radius     — circle radius in px (default 14)
         draggable  — enable d3.drag (bool, default false)
         onDrag     — callback(charge, newX, newY) during drag
       ========================================================== */

    function drawCharges(charges, opts) {
        opts = opts || {};
        var radius    = opts.radius || 14;
        var draggable = opts.draggable || false;
        var onDrag    = opts.onDrag || null;

        g.selectAll('.em-charge').remove();

        var chargeGroups = g.selectAll('.em-charge')
            .data(charges)
            .enter()
            .append('g')
            .attr('class', 'em-charge')
            .attr('transform', function (d) {
                return 'translate(' + xScale(d.x) + ',' + yScale(d.y) + ')';
            })
            .style('cursor', draggable ? 'grab' : 'default');

        /* Charge circle */
        chargeGroups.append('circle')
            .attr('r', radius)
            .attr('fill', function (d) { return d.q > 0 ? POSITIVE_COLOR : NEGATIVE_COLOR; })
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .attr('opacity', 0.9);

        /* Plus / minus symbol */
        chargeGroups.append('text')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('fill', '#fff')
            .attr('font-size', radius * 1.2 + 'px')
            .attr('font-weight', 'bold')
            .attr('pointer-events', 'none')
            .text(function (d) { return d.q > 0 ? '+' : '\u2212'; });

        /* Tooltip on hover */
        chargeGroups
            .on('mouseover', function (event, d) {
                d3.select(this).select('circle').attr('r', radius + 3);
                showTooltip(event,
                    'q = ' + (d.q > 0 ? '+' : '') + d.q.toFixed(2) +
                    '  (' + d.x.toFixed(1) + ', ' + d.y.toFixed(1) + ')');
            })
            .on('mouseout', function () {
                d3.select(this).select('circle').attr('r', radius);
                hideTooltip();
            });

        /* Drag behaviour */
        if (draggable) {
            var dragBehavior = d3.drag()
                .on('start', function (event) {
                    d3.select(this).style('cursor', 'grabbing');
                })
                .on('drag', function (event, d) {
                    var newX = xScale.invert(event.x);
                    var newY = yScale.invert(event.y);
                    /* Clamp to plot area */
                    var clamped = _clampToPlot(newX, newY);
                    d.x = clamped.x;
                    d.y = clamped.y;
                    d3.select(this)
                        .attr('transform', 'translate(' + xScale(d.x) + ',' + yScale(d.y) + ')');
                    if (onDrag) onDrag(d, d.x, d.y);
                })
                .on('end', function () {
                    d3.select(this).style('cursor', 'grab');
                });

            chargeGroups.call(dragBehavior);
        }
    }

    /* ==========================================================
       drawWave(params, opts)
       ----------------------------------------------------------
       Animated sinusoidal wave.

       params:
         amplitude   — wave amplitude in data coords
         wavelength  — spatial wavelength in data coords
         frequency   — temporal frequency (cycles per second)
         phase       — initial phase offset (radians)
         direction   — 'x' (horizontal) or 'y' (vertical)

       opts:
         color    — line colour
         width    — stroke width (default 2)
         animate  — enable animation (bool, default true)
         yOffset  — vertical offset in data coords (default 0)
         numPts   — number of sample points (default 200)
       ========================================================== */

    function drawWave(params, opts) {
        opts = opts || {};
        params = params || {};

        var amp       = params.amplitude  || 1;
        var wl        = params.wavelength || 4;
        var freq      = params.frequency  || 1;
        var phase0    = params.phase      || 0;
        var dir       = params.direction  || 'x';

        var color     = opts.color || config.accentColor || DEFAULT_ACCENT;
        var strokeW   = opts.width || 2;
        var shouldAnim = opts.animate !== undefined ? opts.animate : true;
        var yOff      = opts.yOffset || 0;
        var numPts    = opts.numPts || 200;

        g.selectAll('.em-wave').remove();

        var xd = xScale.domain();
        var k = 2 * Math.PI / wl;        /* spatial wave number */
        var omega = 2 * Math.PI * freq;   /* angular frequency */

        /* Generate initial wave path */
        var lineGen = d3.line()
            .x(function (d) { return xScale(d.x); })
            .y(function (d) { return yScale(d.y); })
            .curve(d3.curveNatural);

        function computeWavePoints(t) {
            var pts = [];
            var dxStep = (xd[1] - xd[0]) / (numPts - 1);
            for (var i = 0; i < numPts; i++) {
                var xVal = xd[0] + i * dxStep;
                if (dir === 'x') {
                    pts.push({
                        x: xVal,
                        y: yOff + amp * Math.sin(k * xVal - omega * t + phase0)
                    });
                } else {
                    pts.push({
                        x: yOff + amp * Math.sin(k * xVal - omega * t + phase0),
                        y: xVal
                    });
                }
            }
            return pts;
        }

        var wavePath = g.append('path')
            .attr('class', 'em-wave')
            .attr('d', lineGen(computeWavePoints(0)))
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', strokeW)
            .attr('opacity', 0.85);

        /* Animation loop */
        if (shouldAnim) {
            var startTime = null;
            function animateWave(timestamp) {
                if (!startTime) startTime = timestamp;
                var t = (timestamp - startTime) / 1000;
                wavePath.attr('d', lineGen(computeWavePoints(t)));
                var frameId = requestAnimationFrame(animateWave);
                animationFrameIds.push(frameId);
            }
            var id = requestAnimationFrame(animateWave);
            animationFrameIds.push(id);
        }
    }

    /* ==========================================================
       drawParticleTrajectory(trajectory, opts)
       ----------------------------------------------------------
       Draw a particle path and animate a particle along it.

       trajectory: [{ x, y, t }]

       opts:
         color          — trail colour
         trailLength    — number of trailing segments (default 30)
         particleRadius — particle dot radius (default 5)
         animate        — enable animation (bool, default true)
         duration       — total animation duration ms (default 3000)
       ========================================================== */

    function drawParticleTrajectory(trajectory, opts) {
        opts = opts || {};

        var color    = opts.color || '#f0c040';
        var trailLen = opts.trailLength || 30;
        var pRadius  = opts.particleRadius || 5;
        var shouldAnim = opts.animate !== undefined ? opts.animate : true;
        var duration = opts.duration || 3000;

        g.selectAll('.em-particle').remove();
        g.selectAll('.em-trajectory').remove();

        if (!trajectory || trajectory.length < 2) return;

        /* Draw the full trajectory path (faded) */
        var lineGen = d3.line()
            .x(function (d) { return xScale(d.x); })
            .y(function (d) { return yScale(d.y); })
            .curve(d3.curveNatural);

        g.append('path')
            .attr('class', 'em-trajectory')
            .attr('d', lineGen(trajectory))
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 1)
            .attr('opacity', 0.2);

        /* Particle dot */
        var particle = g.append('circle')
            .attr('class', 'em-particle')
            .attr('cx', xScale(trajectory[0].x))
            .attr('cy', yScale(trajectory[0].y))
            .attr('r', pRadius)
            .attr('fill', color)
            .attr('opacity', 0.9);

        /* Fading trail */
        var trail = g.append('path')
            .attr('class', 'em-particle')
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 2.5)
            .attr('stroke-linecap', 'round')
            .attr('opacity', 0.6);

        if (shouldAnim) {
            var totalPts = trajectory.length;
            var startTime = null;

            function animateParticle(timestamp) {
                if (!startTime) startTime = timestamp;
                var elapsed = timestamp - startTime;
                var progress = (elapsed % duration) / duration;
                var idx = Math.floor(progress * (totalPts - 1));
                idx = Math.min(idx, totalPts - 1);

                var pt = trajectory[idx];
                particle
                    .attr('cx', xScale(pt.x))
                    .attr('cy', yScale(pt.y));

                /* Draw trail from a window of recent points */
                var trailStart = Math.max(0, idx - trailLen);
                var trailPts = trajectory.slice(trailStart, idx + 1);
                if (trailPts.length > 1) {
                    trail.attr('d', lineGen(trailPts))
                        .attr('opacity', 0.6);
                }

                var frameId = requestAnimationFrame(animateParticle);
                animationFrameIds.push(frameId);
            }
            var id = requestAnimationFrame(animateParticle);
            animationFrameIds.push(id);
        }
    }

    /* ==========================================================
       drawCurrentWire(points, opts)
       ----------------------------------------------------------
       Wire carrying current with direction indicators.

       points: [{ x, y }]

       opts:
         color    — wire colour (default '#d0d0d0')
         width    — stroke width (default 3)
         current  — current value (positive = arrow direction)
         label    — text label for the wire
       ========================================================== */

    function drawCurrentWire(points, opts) {
        opts = opts || {};
        var color   = opts.color || '#d0d0d0';
        var strokeW = opts.width || 3;
        var current = opts.current || 0;
        var label   = opts.label || '';

        g.selectAll('.em-wire').remove();

        if (!points || points.length < 2) return;

        var lineGen = d3.line()
            .x(function (d) { return xScale(d.x); })
            .y(function (d) { return yScale(d.y); })
            .curve(d3.curveLinear);

        /* Wire path */
        g.append('path')
            .attr('class', 'em-wire')
            .attr('d', lineGen(points))
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', strokeW)
            .attr('stroke-linecap', 'round')
            .attr('opacity', 0.85);

        /* Direction arrows along the wire if current is nonzero */
        if (Math.abs(current) > 1e-12) {
            var dir = current > 0 ? 1 : -1;
            var arrowMarkerId = instanceId + '-wire-arrow';
            _defineArrowMarker(arrowMarkerId, 8, 5, color);

            /* Place arrows at regular intervals along the wire */
            var nArrows = Math.max(2, Math.floor(points.length / 3));
            var step = Math.floor(points.length / (nArrows + 1));

            for (var a = 1; a <= nArrows; a++) {
                var i0 = a * step;
                var i1 = Math.min(i0 + 1, points.length - 1);
                if (dir < 0) {
                    var tmp = i0; i0 = i1; i1 = tmp;
                }
                g.append('line')
                    .attr('class', 'em-wire')
                    .attr('x1', xScale(points[i0].x))
                    .attr('y1', yScale(points[i0].y))
                    .attr('x2', xScale(points[i1].x))
                    .attr('y2', yScale(points[i1].y))
                    .attr('stroke', color)
                    .attr('stroke-width', 0)
                    .attr('marker-end', 'url(#' + arrowMarkerId + ')');
            }
        }

        /* Label */
        if (label) {
            var midIdx = Math.floor(points.length / 2);
            g.append('text')
                .attr('class', 'em-wire')
                .attr('x', xScale(points[midIdx].x))
                .attr('y', yScale(points[midIdx].y) - 10)
                .attr('text-anchor', 'middle')
                .attr('fill', color)
                .attr('font-size', '11px')
                .text(label);
        }
    }

    /* ==========================================================
       drawCircle(cx, cy, r, opts)
       ----------------------------------------------------------
       Draw a circle for Gaussian surfaces, Amperian loops, etc.

       opts:
         fill        — fill colour (default 'none')
         stroke      — stroke colour (default accent)
         strokeWidth — stroke width (default 1.5)
         dasharray   — SVG dash pattern (default none)
         opacity     — opacity (default 0.7)
         label       — text label near the circle
       ========================================================== */

    function drawCircle(cx, cy, r, opts) {
        opts = opts || {};
        var fill    = opts.fill || 'none';
        var stroke  = opts.stroke || config.accentColor || DEFAULT_ACCENT;
        var strokeW = opts.strokeWidth || 1.5;
        var dash    = opts.dasharray || '';
        var opac    = opts.opacity !== undefined ? opts.opacity : 0.7;
        var label   = opts.label || '';

        /* Convert data-coordinate radius to pixel radius (use x-scale) */
        var pxCx = xScale(cx);
        var pxCy = yScale(cy);
        var pxR  = Math.abs(xScale(cx + r) - xScale(cx));

        var circle = g.append('ellipse')
            .attr('class', 'em-surface')
            .attr('cx', pxCx)
            .attr('cy', pxCy)
            .attr('rx', pxR)
            .attr('ry', Math.abs(yScale(cy - r) - yScale(cy)))
            .attr('fill', fill)
            .attr('stroke', stroke)
            .attr('stroke-width', strokeW)
            .attr('opacity', opac);

        if (dash) {
            circle.attr('stroke-dasharray', dash);
        }

        if (label) {
            g.append('text')
                .attr('class', 'em-surface')
                .attr('x', pxCx)
                .attr('y', pxCy - pxR - 8)
                .attr('text-anchor', 'middle')
                .attr('fill', stroke)
                .attr('font-size', '11px')
                .attr('opacity', opac)
                .text(label);
        }
    }

    /* ==========================================================
       Tooltip Helpers
       ========================================================== */

    var tooltipEl = null;

    function showTooltip(event, text) {
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.style.cssText =
                'position:fixed;padding:6px 10px;background:rgba(0,0,0,.85);' +
                'color:#fff;font-size:12px;border-radius:4px;pointer-events:none;' +
                'z-index:999;white-space:nowrap;';
            document.body.appendChild(tooltipEl);
        }
        tooltipEl.textContent = typeof text === 'string' ? text : String(text);
        tooltipEl.style.left = (event.clientX || event.pageX || 0) + 12 + 'px';
        tooltipEl.style.top  = (event.clientY || event.pageY || 0) - 28 + 'px';
        tooltipEl.style.display = 'block';
    }

    function hideTooltip() {
        if (tooltipEl) tooltipEl.style.display = 'none';
    }

    /* ==========================================================
       Clear & Reset
       ========================================================== */

    function clear() {
        _cancelAnimations();
        if (g) {
            g.selectAll(
                '.em-vector,.em-field-line,.em-equipotential,' +
                '.em-charge,.em-wave,.em-particle,.em-trajectory,' +
                '.em-wire,.em-surface'
            ).remove();
        }
    }

    function resetZoom() {
        if (svg && zoom) {
            svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
        }
    }

    /* ==========================================================
       Private Helper: _defineArrowMarker
       ----------------------------------------------------------
       Creates an SVG arrowhead marker in <defs>.
       ========================================================== */

    function _defineArrowMarker(id, markerW, markerH, fillColor) {
        if (!defs) return;
        /* Remove existing marker with the same id to avoid duplicates */
        defs.select('#' + id).remove();

        defs.append('marker')
            .attr('id', id)
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 10)
            .attr('refY', 5)
            .attr('markerWidth', markerW)
            .attr('markerHeight', markerH)
            .attr('orient', 'auto-start-reverse')
            .attr('markerUnits', 'strokeWidth')
            .append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z')
            .attr('fill', fillColor === 'context-stroke' ? 'context-stroke' : fillColor);
    }

    /* ==========================================================
       Private Helper: _compositeElectricField
       ----------------------------------------------------------
       Returns a function E(x,y) -> {x, y} for the superposition
       of Coulomb fields from an array of point charges.
       Uses Coulomb's law: E = k * q / r^2 in the r-hat direction.
       k is set to 1 for normalized visualization.
       ========================================================== */

    function _compositeElectricField(sources) {
        return function (x, y) {
            var Ex = 0, Ey = 0;
            for (var i = 0; i < sources.length; i++) {
                var s = sources[i];
                var dx = x - s.x;
                var dy = y - s.y;
                var r2 = dx * dx + dy * dy;
                if (r2 < 1e-6) r2 = 1e-6; /* avoid singularity */
                var r = Math.sqrt(r2);
                var E = s.q / r2;
                Ex += E * (dx / r);
                Ey += E * (dy / r);
            }
            return { x: Ex, y: Ey };
        };
    }

    /* ==========================================================
       Private Helper: _rk4Step
       ----------------------------------------------------------
       Single 4th-order Runge-Kutta integration step.
       fieldFn(x, y) -> { x: Fx, y: Fy }
       Returns the normalized direction advanced by step h.
       ========================================================== */

    function _rk4Step(fieldFn, x, y, h) {
        function norm(f) {
            var mag = Math.sqrt(f.x * f.x + f.y * f.y);
            if (mag < 1e-20) return { x: 0, y: 0 };
            return { x: f.x / mag, y: f.y / mag };
        }

        var k1 = norm(fieldFn(x, y));
        var k2 = norm(fieldFn(x + 0.5 * h * k1.x, y + 0.5 * h * k1.y));
        var k3 = norm(fieldFn(x + 0.5 * h * k2.x, y + 0.5 * h * k2.y));
        var k4 = norm(fieldFn(x + h * k3.x, y + h * k3.y));

        return {
            x: x + (h / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
            y: y + (h / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y)
        };
    }

    /* ==========================================================
       Private Helper: _traceFieldLine
       ----------------------------------------------------------
       Traces a single field line from (sx, sy) in the given
       direction (+1 outward from positive, -1 inward).
       Stops if the line exits plot bounds or approaches a charge.
       ========================================================== */

    function _traceFieldLine(fieldFn, sources, sx, sy, direction, stepSize, maxSteps) {
        var path = [{ x: sx, y: sy }];
        var h = stepSize * direction;
        var xd = xScale.domain();
        var yd = yScale.domain();
        var cx = sx, cy = sy;

        for (var step = 0; step < maxSteps; step++) {
            var next = _rk4Step(fieldFn, cx, cy, h);
            cx = next.x;
            cy = next.y;

            /* Check bounds */
            if (cx < xd[0] || cx > xd[1] || cy < yd[0] || cy > yd[1]) {
                /* Clamp final point to boundary and add it */
                path.push({
                    x: Math.max(xd[0], Math.min(xd[1], cx)),
                    y: Math.max(yd[0], Math.min(yd[1], cy))
                });
                break;
            }

            /* Check proximity to any charge (stop if too close) */
            var hitCharge = false;
            for (var c = 0; c < sources.length; c++) {
                var ddx = cx - sources[c].x;
                var ddy = cy - sources[c].y;
                if (ddx * ddx + ddy * ddy < CHARGE_STOP_R2) {
                    hitCharge = true;
                    break;
                }
            }

            path.push({ x: cx, y: cy });
            if (hitCharge) break;
        }

        return path;
    }

    /* ==========================================================
       Private Helper: _marchingSquares
       ----------------------------------------------------------
       Extracts line segments for a single contour level from a
       sampled 2D grid using the marching squares algorithm with
       linear interpolation for sub-cell accuracy.

       Returns: [{ x1, y1, x2, y2 }, ...]
       ========================================================== */

    function _marchingSquares(grid, threshold, xd, yd, dx, dy) {
        var segments = [];
        var rows = grid.length - 1;
        var cols = grid[0].length - 1;

        for (var j = 0; j < rows; j++) {
            for (var i = 0; i < cols; i++) {
                /* Corner values: top-left, top-right, bottom-right, bottom-left */
                var tl = grid[j + 1][i];       /* top-left in data coords (y increases up) */
                var tr = grid[j + 1][i + 1];   /* top-right */
                var br = grid[j][i + 1];       /* bottom-right */
                var bl = grid[j][i];           /* bottom-left */

                /* Classification: 4-bit case index */
                var caseIndex = 0;
                if (bl >= threshold) caseIndex |= 1;
                if (br >= threshold) caseIndex |= 2;
                if (tr >= threshold) caseIndex |= 4;
                if (tl >= threshold) caseIndex |= 8;

                if (caseIndex === 0 || caseIndex === 15) continue;

                /* Cell corners in data coordinates */
                var x0 = xd[0] + i * dx;       /* left */
                var x1 = xd[0] + (i + 1) * dx; /* right */
                var y0 = yd[0] + j * dy;        /* bottom */
                var y1 = yd[0] + (j + 1) * dy;  /* top */

                /* Linear interpolation of edge crossings */
                var bottom = _lerp(x0, x1, bl, br, threshold);  /* bottom edge */
                var right  = _lerp(y0, y1, br, tr, threshold);  /* right edge */
                var top    = _lerp(x0, x1, tl, tr, threshold);  /* top edge */
                var left   = _lerp(y0, y1, bl, tl, threshold);  /* left edge */

                /* Generate segments based on the 16-case lookup */
                switch (caseIndex) {
                    case 1:  segments.push({ x1: x0,     y1: left, x2: bottom, y2: y0 });     break;
                    case 2:  segments.push({ x1: bottom, y1: y0,   x2: x1,     y2: right });   break;
                    case 3:  segments.push({ x1: x0,     y1: left, x2: x1,     y2: right });   break;
                    case 4:  segments.push({ x1: x1,     y1: right, x2: top,   y2: y1 });      break;
                    case 5:
                        /* Saddle point: use average to disambiguate */
                        var avg = (bl + br + tr + tl) / 4;
                        if (avg >= threshold) {
                            segments.push({ x1: x0, y1: left, x2: top,    y2: y1 });
                            segments.push({ x1: bottom, y1: y0, x2: x1,   y2: right });
                        } else {
                            segments.push({ x1: x0, y1: left, x2: bottom, y2: y0 });
                            segments.push({ x1: x1, y1: right, x2: top,   y2: y1 });
                        }
                        break;
                    case 6:  segments.push({ x1: bottom, y1: y0,   x2: top,   y2: y1 });      break;
                    case 7:  segments.push({ x1: x0,     y1: left, x2: top,   y2: y1 });      break;
                    case 8:  segments.push({ x1: top,    y1: y1,   x2: x0,    y2: left });    break;
                    case 9:  segments.push({ x1: top,    y1: y1,   x2: bottom, y2: y0 });     break;
                    case 10:
                        /* Saddle point */
                        var avg10 = (bl + br + tr + tl) / 4;
                        if (avg10 >= threshold) {
                            segments.push({ x1: top, y1: y1, x2: x1,     y2: right });
                            segments.push({ x1: x0,  y1: left, x2: bottom, y2: y0 });
                        } else {
                            segments.push({ x1: top,    y1: y1, x2: x0,    y2: left });
                            segments.push({ x1: bottom, y1: y0, x2: x1,    y2: right });
                        }
                        break;
                    case 11: segments.push({ x1: top,    y1: y1,   x2: x1,    y2: right });   break;
                    case 12: segments.push({ x1: x1,     y1: right, x2: x0,   y2: left });    break;
                    case 13: segments.push({ x1: bottom, y1: y0,   x2: x0,    y2: left });
                             /* Flip of case 1 — wait, case 13 = ~case 2 */
                             segments.pop();
                             segments.push({ x1: x1, y1: right, x2: bottom, y2: y0 });
                             break;
                    case 14: segments.push({ x1: bottom, y1: y0,   x2: x0,    y2: left });    break;
                }
            }
        }

        return segments;
    }

    /* ==========================================================
       Private Helper: _lerp
       ----------------------------------------------------------
       Linear interpolation to find where the threshold crosses
       between two values along an edge from position p0 to p1.
       ========================================================== */

    function _lerp(p0, p1, v0, v1, threshold) {
        if (Math.abs(v1 - v0) < 1e-12) return (p0 + p1) * 0.5;
        var t = (threshold - v0) / (v1 - v0);
        t = Math.max(0, Math.min(1, t));
        return p0 + t * (p1 - p0);
    }

    /* ==========================================================
       Private Helper: _clampToPlot
       ----------------------------------------------------------
       Clamps data coordinates to the current plot domain.
       ========================================================== */

    function _clampToPlot(x, y) {
        var xd = xScale.domain();
        var yd = yScale.domain();
        return {
            x: Math.max(xd[0], Math.min(xd[1], x)),
            y: Math.max(yd[0], Math.min(yd[1], y))
        };
    }

    /* ==========================================================
       Private Helper: _cancelAnimations
       ----------------------------------------------------------
       Cancel all pending requestAnimationFrame callbacks.
       ========================================================== */

    function _cancelAnimations() {
        for (var i = 0; i < animationFrameIds.length; i++) {
            cancelAnimationFrame(animationFrameIds[i]);
        }
        animationFrameIds = [];
    }

    /* ==========================================================
       Private Helper: _getCssVar
       ----------------------------------------------------------
       Read a CSS custom property from the document root.
       ========================================================== */

    function _getCssVar(name) {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(name).trim();
    }

    /* ==========================================================
       Public API — window.EMZoo.diagram
       ========================================================== */

    window.EMZoo = window.EMZoo || {};
    window.EMZoo.diagram = {
        /* Setup */
        init:                   init,

        /* EM field primitives */
        drawVectorField:        drawVectorField,
        drawFieldLines:         drawFieldLines,
        drawEquipotentials:     drawEquipotentials,
        drawCharges:            drawCharges,
        drawWave:               drawWave,
        drawParticleTrajectory: drawParticleTrajectory,
        drawCurrentWire:        drawCurrentWire,
        drawCircle:             drawCircle,

        /* Utilities */
        clear:                  clear,
        resetZoom:              resetZoom,
        showTooltip:            showTooltip,
        hideTooltip:            hideTooltip,

        /* Accessors */
        getScales: function () { return { x: xScale, y: yScale }; },
        getGroup:  function () { return g; },
        getSvg:    function () { return svg; }
    };
})();
