/**
 * Hydrograph charting module.
 */
const { extent } = require('d3-array');
const { line: d3Line } = require('d3-shape');
const { select } = require('d3-selection');

const { createStructuredSelector } = require('reselect');

const { addSVGAccessibility, addSROnlyTable } = require('../../accessibility');
const { USWDS_MEDIUM_SCREEN, STATIC_URL } = require('../../config');
const { dispatch, link, provide } = require('../../lib/redux');
const { Actions } = require('../../store');
const { mediaQuery } = require('../../utils');

const { audibleUI } = require('./audible');
const { appendAxes, axesSelector } = require('./axes');
const { cursorSlider } = require('./cursor');
const { pointsTableDataSelector, lineSegmentsByParmCdSelector, currentVariableLineSegmentsSelector,
    MASK_DESC, HASH_ID } = require('./drawingData');
const { CIRCLE_RADIUS, CIRCLE_RADIUS_SINGLE_PT, SPARK_LINE_DIM, layoutSelector } = require('./layout');
const { drawSimpleLegend, legendMarkerRowsSelector } = require('./legend');
const { plotSeriesSelectTable, availableTimeseriesSelector } = require('./parameters');
const { xScaleSelector, yScaleSelector, timeSeriesScalesByParmCdSelector } = require('./scales');
const { allTimeSeriesSelector, currentVariableSelector, methodsSelector, isVisibleSelector, titleSelector,
    descriptionSelector,  currentVariableTimeSeriesSelector, timeSeriesSelector } = require('./timeseries');
const { createTooltipFocus, createTooltipText } = require('./tooltip');


const drawMessage = function (elem, message) {
    // Set up parent element and SVG
    elem.innerHTML = '';
    const alertBox = elem
        .append('div')
            .attr('class', 'usa-alert usa-alert-warning')
            .append('div')
                .attr('class', 'usa-alert-body');
    alertBox
        .append('h3')
            .attr('class', 'usa-alert-heading')
            .html('Hydrograph Alert');
    alertBox
        .append('p')
            .html(message);
};


const plotDataLine = function (elem, {visible, lines, tsKey, xScale, yScale}) {
    if (!visible) {
        return;
    }

    for (let line of lines) {
        if (line.classes.dataMask === null) {
            // If this is a single point line, then represent it as a circle.
            // Otherwise, render as a line.
            if (line.points.length === 1) {
                elem.append('circle')
                    .data(line.points)
                    .classed('line-segment', true)
                    .classed('approved', line.classes.approved)
                    .classed('estimated', line.classes.estimated)
                    .attr('r', CIRCLE_RADIUS_SINGLE_PT)
                    .attr('cx', d => xScale(d.dateTime))
                    .attr('cy', d => yScale(d.value));
            } else {
                const tsLine = d3Line()
                    .x(d => xScale(d.dateTime))
                    .y(d => yScale(d.value));
                elem.append('path')
                    .datum(line.points)
                    .classed('line-segment', true)
                    .classed('approved', line.classes.approved)
                    .classed('estimated', line.classes.estimated)
                    .classed(`ts-${tsKey}`, true)
                    .attr('d', tsLine);
            }
        } else {
            const maskCode = line.classes.dataMask.toLowerCase();
            const maskDisplayName = MASK_DESC[maskCode].replace(' ', '-').toLowerCase();
            const [xDomainStart, xDomainEnd] = extent(line.points, d => d.dateTime);
            const [yRangeStart, yRangeEnd] = yScale.domain();
            let maskGroup = elem.append('g')
                .attr('class', `${tsKey}-mask-group`);
            const xSpan = xScale(xDomainEnd) - xScale(xDomainStart);
            const rectWidth = xSpan > 0 ? xSpan : 1;

            maskGroup.append('rect')
                .attr('x', xScale(xDomainStart))
                .attr('y', yScale(yRangeEnd))
                .attr('width', rectWidth)
                .attr('height', Math.abs(yScale(yRangeEnd)- yScale(yRangeStart)))
                .attr('class', `mask ${maskDisplayName}-mask`);

            const patternId = HASH_ID[tsKey] ? `url(#${HASH_ID[tsKey]})` : '';

            maskGroup.append('rect')
                .attr('x', xScale(xDomainStart))
                .attr('y', yScale(yRangeEnd))
                .attr('width', rectWidth)
                .attr('height', Math.abs(yScale(yRangeEnd) - yScale(yRangeStart)))
                .attr('fill', patternId);
        }
    }
};


const plotDataLines = function (elem, {visible, tsLinesMap, tsKey, xScale, yScale}, container) {
    container = container || elem.append('g');

    const elemId = `ts-${tsKey}-group`;
    container.selectAll(`#${elemId}`).remove();
    const tsLineGroup = container
        .append('g')
        .attr('id', elemId)
        .classed('tsKey', true);

    for (const lines of Object.values(tsLinesMap)) {
        plotDataLine(tsLineGroup, {visible, lines, tsKey, xScale, yScale});
    }

    return container;
};


const plotSvgDefs = function(elem) {

    let defs = elem.append('defs');

    defs.append('mask')
        .attr('id', 'display-mask')
        .attr('maskUnits', 'userSpaceOnUse')
        .append('rect')
            .attr('x', '0')
            .attr('y', '0')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('fill', '#0000ff');

    defs.append('pattern')
        .attr('id', HASH_ID.current)
        .attr('width', '8')
        .attr('height', '8')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('patternTransform', 'rotate(45)')
        .append('rect')
            .attr('width', '4')
            .attr('height', '8')
            .attr('transform', 'translate(0, 0)')
            .attr('mask', 'url(#display-mask)');

    defs.append('pattern')
        .attr('id', HASH_ID.compare)
        .attr('width', '8')
        .attr('height', '8')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('patternTransform', 'rotate(135)')
        .append('rect')
            .attr('width', '4')
            .attr('height', '8')
            .attr('transform', 'translate(0, 0)')
            .attr('mask', 'url(#display-mask)');
};


const timeSeriesLegend = function(elem) {
    elem.append('div')
        .classed('hydrograph-container', true)
        .call(link(drawSimpleLegend, createStructuredSelector({
            legendMarkerRows: legendMarkerRowsSelector,
            layout: layoutSelector
        })));
};


/**
 * Plots the median points for a single median time series.
 * @param  {Object} elem
 * @param  {Function} xscale
 * @param  {Function} yscale
 * @param  {Number} modulo
 * @param  {Array} points
 * @param  {Boolean} showLabel
 * @param  {Object} variable
 */
const plotMedianPoints = function (elem, {xscale, yscale, modulo, points, showLabel, variable}) {
    elem.selectAll('medianPoint')
        .data(points)
        .enter()
        .append('circle')
            .classed('median-data-series', true)
            .classed(`median-modulo-${modulo}`, true)
            .attr('r', CIRCLE_RADIUS)
            .attr('cx', function(d) {
                return xscale(d.dateTime);
            })
            .attr('cy', function(d) {
                return yscale(d.value);
            })
            .on('click', dispatch(function() {
                return Actions.showMedianStatsLabel(!showLabel);
            }));

    if (showLabel) {
        elem.selectAll('medianPointText')
            .data(points)
            .enter()
            .append('text')
                .text(function(d) {
                    return `${d.value} ${variable.unit.unitCode}`;
                })
                .attr('x', function(d) {
                    return xscale(d.dateTime) + 5;
                })
                .attr('y', function(d) {
                    return yscale(d.value);
                });
    }
};

/**
 * Plots the median points for all median time series for the current variable.
 * @param  {Object} elem
 * @param  {Boolean} visible
 * @param  {Function} xscale
 * @param  {Function} yscale
 * @param  {Array} pointsList
 * @param  {Boolean} showLabel
 * @param  {Object} variable
 */
const plotAllMedianPoints = function (elem, {visible, xscale, yscale, seriesMap, showLabel, variable}) {
    elem.select('#median-points').remove();

    if (!visible) {
        return;
    }
    const container = elem
        .append('g')
            .attr('id', 'median-points');

    for (const [index, seriesID] of Object.keys(seriesMap).entries()) {
        const points = seriesMap[seriesID].points;
        plotMedianPoints(container, {xscale, yscale, modulo: index % 6, points, showLabel, variable});
    }
};

const plotSROnlyTable = function (elem, {tsKey, variable, methods, visible, dataByTsID, timeSeries}) {
    elem.selectAll(`#sr-only-${tsKey}`).remove();

    if (!visible) {
        return;
    }

    const container = elem.append('div')
        .attr('id', `sr-only-${tsKey}`)
        .classed('usa-sr-only', true);


    for (const seriesID of Object.keys(timeSeries)) {
        const series = timeSeries[seriesID];
        const method = methods[series.method].methodDescription;
        let title = variable.variableName;
        if (method) {
            title += ` (${method})`;
        }
        if (tsKey === 'median') {
            title = `Median ${title}`;
        }
        addSROnlyTable(container, {
            columnNames: [title, 'Time', 'Qualifiers'],
            data: dataByTsID[seriesID],
            describeById: `${seriesID}-time-series-sr-desc`,
            describeByText: `${seriesID} time series data in tabular format`
        });
    }
};


const createTitle = function(elem) {
    elem.append('div')
        .classed('timeseries-graph-title', true)
        .call(link((elem, title) => {
            elem.html(title);
        }, titleSelector));
};


// start of watermark const

const watermark = function(elem) {
    let usgs_logo = 'M32.736 42.595l.419.403c11.752 9.844 24.431 8.886 34.092 2.464 6.088-4.049 33.633-22.367 49.202-32.718V2.4H.419v27.309c7.071-1.224 18.47-.022 32.316 12.886M76.386 88.02L62.681 74.878a66.75 66.75 0 0 0-3.927-3.313c-11.204-7.867-21.646-5.476-26.149-3.802-1.362.544-2.665 1.287-3.586 1.869L.417 88.762v34.666h116.03v-24.95c-2.55 1.62-18.27 10.12-40.063-10.46M31.707 45.696a43.614 43.614 0 0 0-1.915-1.698C16.09 33.398 3.146 38.589.416 39.882v11.931L7.13 47.29s10.346-7.674 26.446.195l-1.869-1.789m16.028 15.409a66.214 66.214 0 0 1-1.823-1.664c-12.157-10.285-23.908-7.67-28.781-5.864-1.382.554-2.7 1.303-3.629 1.887L.416 64.218v12.288l21.888-14.748s10.228-7.589 26.166.054l-.735-.707m68.722 12.865a7338.581 7338.581 0 0 1-11.048 7.441c-4.128 2.765-13.678 9.614-29.577 2.015l1.869 1.797c.699.63 1.554 1.362 2.481 2.077 11.418 8.53 23.62 7.303 32.769 1.243a750.293 750.293 0 0 0 3.507-2.334V73.975m0-24.61a65305.816 65305.816 0 0 1-26.085 17.536c-4.127 2.765-13.82 9.708-29.379 2.273l1.804 1.729c.205.19.409.375.612.571l-.01.01.01-.01c12.079 10.22 25.379 8.657 34.501 2.563a3556.91 3556.91 0 0 0 18.548-12.507l-.01-12.165m0-24.481c-14.452 9.682-38.162 25.568-41.031 27.493-4.162 2.789-13.974 9.836-29.335 2.5l1.864 1.796c1.111 1.004 2.605 2.259 4.192 3.295 10.632 6.792 21.759 5.591 30.817-.455a23884.49 23884.49 0 0 1 33.493-22.285V24.884M218.95 2.44v85.037c0 17.938-10.132 36.871-40.691 36.871-27.569 0-40.859-14.281-40.859-36.871V2.437h25.08v83.377c0 14.783 6.311 20.593 15.447 20.593 10.959 0 15.943-7.307 15.943-20.593V2.437h25.08m40.79 121.91c-31.058 0-36.871-18.27-35.542-39.03h25.078c0 11.462.5 21.092 14.282 21.092 8.472 0 12.62-5.482 12.62-13.618 0-21.592-50.486-22.922-50.486-58.631 0-18.769 8.968-33.715 39.525-33.715 24.42 0 36.543 10.963 34.883 36.043h-24.419c0-8.974-1.492-18.106-11.627-18.106-8.136 0-12.953 4.486-12.953 12.787 0 22.757 50.493 20.763 50.493 58.465 0 31.06-22.75 34.72-41.85 34.72m168.6 0c-31.06 0-36.871-18.27-35.539-39.03h25.075c0 11.462.502 21.092 14.285 21.092 8.475 0 12.625-5.482 12.625-13.618 0-21.592-50.494-22.922-50.494-58.631 0-18.769 8.969-33.715 39.531-33.715 24.412 0 36.536 10.963 34.875 36.043H444.29c0-8.974-1.494-18.106-11.625-18.106-8.144 0-12.955 4.486-12.955 12.787 0 22.757 50.486 20.763 50.486 58.465 0 31.06-22.75 34.72-41.85 34.72m-79.89-46.684h14.76v26.461l-1.229.454c-3.816 1.332-8.301 2.327-12.453 2.327-14.287 0-17.943-6.645-17.943-44.177 0-23.256 0-44.348 15.615-44.348 12.146 0 14.711 8.198 14.933 18.107h24.981C387.318 13.23 372.331.458 348.7.458c-41.021 0-42.52 30.724-42.52 60.954 0 45.507 4.938 63.167 47.12 63.167 9.784 0 25.36-2.211 32.554-4.18.436-.115 1.212-.596 1.212-1.216V59.585h-38.612v18.09M6.329 159.13c-.247.962-.401 1.888-.251 2.554.195.679.749 1.01 1.923 1.01 1.171 0 2.341-.756 2.642-2.182.954-4.479-9.653-3.479-8.218-10.224.972-4.567 5.792-5.954 9.607-5.954 4.022 0 7.257 1.928 5.951 6.495H12.2c.312-1.466.33-2.346-.007-2.721-.298-.38-.783-.464-1.413-.464-1.297 0-2.188.841-2.492 2.264-.714 3.354 9.718 3.189 8.271 9.975-.781 3.688-4.388 6.457-9.29 6.457-5.157 0-8.316-1.306-6.724-7.21h5.784zm25.284-6.85c.667-3.141.093-4.188-1.75-4.188-2.513 0-3.193 2.219-4.13 6.618-1.373 6.455-1.124 7.838 1.057 7.838 1.844 0 3.08-1.676 3.667-4.439h5.909c-1.218 5.741-4.847 8.215-10.382 8.215-7.627 0-7.645-4.654-6.234-11.273 1.229-5.785 3.119-10.73 10.915-10.73 5.447 0 8.033 2.432 6.856 7.963h-5.908v-.004zm18.389-15.686l-.989 4.652h-5.909l.989-4.652h5.909zm-6.233 29.31H37.86l4.501-21.165h5.909l-4.501 21.16v.005zm282.77-29.31l-.991 4.652h-5.911l.99-4.652h5.912zm-6.232 29.31H314.4l4.496-21.165h5.912l-4.5 21.16-.001.005zm-259.03-12.95c.438-2.052 1.144-4.984-1.664-4.984-2.727 0-3.36 3.185-3.743 4.984h5.407zm-6.111 3.31c-.533 2.516-1.251 6.285 1.345 6.285 2.097 0 2.945-2.013 3.318-3.771h5.992c-.574 2.306-1.728 4.192-3.429 5.489-1.66 1.298-3.916 2.055-6.681 2.055-7.63 0-7.645-4.654-6.239-11.273 1.229-5.785 3.12-10.729 10.915-10.729 7.965 0 7.75 5.152 6.097 11.944H55.166zm22.462-9.38h.083c1.575-1.886 3.31-2.557 5.534-2.557 2.808 0 4.923 1.676 4.3 4.608l-3.608 16.977h-5.909l3.099-14.584c.401-1.887.38-3.353-1.507-3.353-1.886 0-2.536 1.468-2.936 3.353l-3.098 14.584h-5.909l4.5-21.165h5.905l-.452 2.14-.002-.003zm23.467 5.403c.667-3.141.093-4.188-1.751-4.188-2.512 0-3.194 2.219-4.131 6.618-1.373 6.455-1.122 7.838 1.058 7.838 1.843 0 3.079-1.676 3.668-4.439h5.909c-1.222 5.741-4.846 8.215-10.382 8.215-7.627 0-7.644-4.654-6.235-11.273 1.229-5.785 3.116-10.73 10.912-10.73 5.45 0 8.037 2.432 6.86 7.963h-5.908v-.004zm19.61.674c.434-2.052 1.145-4.984-1.664-4.984-2.725 0-3.36 3.185-3.743 4.984h5.407zm-6.117 3.31c-.54 2.516-1.255 6.285 1.344 6.285 2.095 0 2.94-2.013 3.316-3.771h5.992c-.574 2.306-1.728 4.192-3.432 5.489-1.656 1.298-3.912 2.055-6.68 2.055-7.627 0-7.647-4.654-6.237-11.273 1.231-5.785 3.12-10.729 10.915-10.729 7.961 0 7.747 5.152 6.093 11.944h-11.311zm36.12-15.9c-2.352-.168-3.051.758-3.507 2.896l-.42 1.482h2.77l-.775 3.645h-2.768l-3.723 17.521h-5.909l3.722-17.521h-2.638l.774-3.645h2.682c1.188-5.292 2.251-8.232 8.516-8.232.713 0 1.376.041 2.08.082l-.79 3.77-.014.002zm9.574 14.348c.937-4.399 1.198-6.618-1.317-6.618-2.512 0-3.196 2.219-4.13 6.618-1.373 6.455-1.122 7.838 1.057 7.838 2.17 0 3.01-1.38 4.39-7.84v.002zm-11.43.338c1.229-5.785 3.117-10.73 10.912-10.73 7.795 0 7.586 4.945 6.355 10.73-1.409 6.618-3.403 11.274-11.032 11.274-7.63 0-7.65-4.65-6.24-11.27l.005-.004zm27.86-10.31l-.577 2.723h.082c1.607-2.431 3.77-3.143 6.162-3.143l-1.122 5.279c-5.129-.335-5.854 2.682-6.298 4.779l-2.448 11.525h-5.909l4.496-21.165h5.62l-.006.002zm17.836 14.578c-.32 1.51-.464 3.354 1.465 3.354 3.479 0 3.935-4.694 4.421-7-2.95.13-5.08-.12-5.88 3.65l-.006-.004zm10.346 2.644c-.281 1.305-.395 2.645-.546 3.942h-5.491l.345-2.808h-.082c-1.721 2.18-3.664 3.229-6.223 3.229-4.105 0-4.961-3.06-4.181-6.748 1.488-7 6.958-7.295 12.43-7.207l.347-1.637c.385-1.804.41-3.104-1.729-3.104-2.054 0-2.549 1.55-2.908 3.229h-5.784c.545-2.557 1.69-4.191 3.278-5.152 1.553-1.01 3.561-1.387 5.827-1.387 7.5 0 7.777 3.229 6.959 7.084l-2.25 10.57.008-.011zm23.39-9.68c.667-3.141.093-4.188-1.749-4.188-2.515 0-3.196 2.219-4.132 6.618-1.373 6.455-1.122 7.838 1.059 7.838 1.842 0 3.08-1.676 3.668-4.439h5.909c-1.221 5.741-4.848 8.215-10.382 8.215-7.627 0-7.642-4.654-6.237-11.273 1.232-5.785 3.121-10.73 10.916-10.73 5.447 0 8.033 2.432 6.857 7.963h-5.909v-.004zm32.45 7.044c-.322 1.51-.463 3.354 1.465 3.354 3.479 0 3.936-4.694 4.42-7-2.96.13-5.09-.12-5.89 3.65l.005-.004zm10.335 2.644c-.281 1.305-.396 2.645-.547 3.942h-5.49l.344-2.808h-.081c-1.72 2.18-3.66 3.229-6.226 3.229-4.103 0-4.961-3.06-4.18-6.748 1.488-7 6.958-7.295 12.432-7.207l.351-1.637c.378-1.804.405-3.104-1.733-3.104-2.057 0-2.55 1.55-2.91 3.229h-5.781c.543-2.557 1.691-4.191 3.277-5.152 1.56-1.01 3.563-1.387 5.827-1.387 7.5 0 7.777 3.229 6.957 7.084l-2.24 10.57v-.011zm12.97-15.08h.08c1.58-1.886 3.31-2.557 5.533-2.557 2.805 0 4.924 1.676 4.297 4.608l-3.608 16.977h-5.906l3.101-14.584c.397-1.887.377-3.353-1.506-3.353-1.889 0-2.535 1.468-2.936 3.353l-3.104 14.584h-5.912l4.505-21.165h5.911l-.45 2.14-.005-.003zm18.635 15.083c2.141 0 2.903-2.219 3.854-6.703.987-4.652 1.342-7.291-.842-7.291-2.22 0-2.926 1.549-4.3 8.004-.42 1.97-1.56 5.99 1.29 5.99h-.002zm12.002-17.22l-4.686 22.045c-.313 1.465-1.461 7.25-9.589 7.25-4.399 0-7.937-1.129-6.965-6.285h5.785c-.187.883-.222 1.636.048 2.136.264.547.87.841 1.794.841 1.468 0 2.472-1.387 2.929-3.521l.863-4.063h-.084c-1.229 1.632-3.082 2.47-5.008 2.47-6.499 0-4.946-5.95-3.928-10.728.992-4.651 2.33-10.563 8.49-10.563 2.096 0 3.705.92 4.121 2.893h.084l.526-2.473h5.616v-.002h.02-.016zm19.78 2.14h.092c1.572-1.886 3.306-2.557 5.525-2.557 2.809 0 4.924 1.676 4.301 4.608l-3.606 16.977h-5.912l3.104-14.584c.398-1.887.377-3.353-1.51-3.353-1.888 0-2.531 1.468-2.931 3.353l-3.104 14.584h-5.91l4.5-21.165h5.91l-.45 2.14-.009-.003zm18.639 15.083c2.137 0 2.902-2.219 3.854-6.703.992-4.652 1.343-7.291-.836-7.291-2.222 0-2.928 1.549-4.301 8.004-.41 1.97-1.56 5.99 1.29 5.99h-.007zm12.007-17.22l-4.686 22.045c-.314 1.465-1.455 7.25-9.593 7.25-4.399 0-7.931-1.129-6.957-6.285h5.785c-.192.883-.226 1.636.043 2.136.264.547.874.841 1.791.841 1.471 0 2.474-1.387 2.929-3.521l.863-4.063h-.079c-1.231 1.632-3.086 2.47-5.011 2.47-6.497 0-4.939-5.95-3.928-10.728.994-4.651 2.33-10.563 8.496-10.563 2.094 0 3.696.92 4.118 2.893h.085l.525-2.473h5.615v-.002h.02-.016zm9.23 0h5.869l-.483 15.926h.08l7.043-15.926h6.279l.08 15.926h.083l6.438-15.926h5.666l-10.043 21.165h-6.195l-.608-14.039h-.081l-7.083 14.039h-6.282l-.78-21.16.017-.005zm41.273 9.975c.936-4.399 1.196-6.618-1.314-6.618-2.52 0-3.203 2.219-4.133 6.618-1.373 6.455-1.121 7.838 1.059 7.838 2.17 0 3.01-1.38 4.38-7.84l.008.002zm-11.438.338c1.226-5.785 3.114-10.73 10.911-10.73 7.796 0 7.586 4.945 6.355 10.73-1.41 6.618-3.402 11.274-11.029 11.274s-7.65-4.65-6.24-11.27l.003-.004zm28.19-10.31l-.582 2.723h.086c1.609-2.431 3.771-3.143 6.16-3.143l-1.123 5.279c-5.125-.335-5.85 2.682-6.297 4.779l-2.449 11.525h-5.906l4.496-21.165h5.61l.005.002zm-182.405-.422c-2.219 0-3.955.671-5.53 2.557h-.086l2.188-10.285h-5.91l-6.231 29.314h5.91l3.103-14.585c.4-1.885 1.047-3.352 2.934-3.352 1.888 0 1.906 1.467 1.51 3.352l-3.102 14.585h5.908l3.605-16.976c.62-2.93-1.49-4.6-4.3-4.6l.001-.01zm192.259-7.72l-6.232 29.313h5.912l6.231-29.313H442.211zm15.801 18.54c-1.132 5.324-1.979 7.545-3.992 7.545-2.135 0-2.043-2.221-.912-7.545.9-4.231 1.481-7.165 4.039-7.165 2.43-.01 1.76 2.92.86 7.15l.005.015zm3.945-18.555l-2.158 10.16h-.084c-.834-1.803-2.165-2.432-4.301-2.432-5.953 0-7.187 6.582-8.097 10.856-.924 4.356-2.578 11.147 3.541 11.147 2.268 0 4.051-.715 5.574-2.768h.087l-.504 2.349h5.621l6.229-29.315h-5.909v-.01l.001.013z';

    elem.append('path')
        .classed('watermark', true)
        .attr('d', usgs_logo );
}

// end of watermark const

const timeSeriesGraph = function (elem) {
    elem.append('div')
        .attr('class', 'hydrograph-container')
        .call(createTitle)
        .call(createTooltipText)
        .append('svg')
            .classed('hydrograph-svg', true)
            .call(link((elem, layout) => elem.attr('viewBox', `0 0 ${layout.width + layout.margin.left + layout.margin.right} ${layout.height + layout.margin.top + layout.margin.bottom}`), layoutSelector))
            .call(link(addSVGAccessibility, createStructuredSelector({
                title: titleSelector,
                description: descriptionSelector,
                isInteractive: () => true
            })))
            .call(plotSvgDefs)
            .call(svg => {
                svg.append('g')
                    .call(link((elem, layout) => elem.attr('transform', `translate(${layout.margin.left},${layout.margin.top})`), layoutSelector))
                    .call(link(appendAxes, axesSelector))
                    .call(link(plotDataLines, createStructuredSelector({
                        visible: isVisibleSelector('current'),
                        tsLinesMap: currentVariableLineSegmentsSelector('current'),
                        xScale: xScaleSelector('current'),
                        yScale: yScaleSelector,
                        tsKey: () => 'current'
                    })))
                    .call(link(plotDataLines, createStructuredSelector({
                        visible: isVisibleSelector('compare'),
                        tsLinesMap: currentVariableLineSegmentsSelector('compare'),
                        xScale: xScaleSelector('compare'),
                        yScale: yScaleSelector,
                        tsKey: () => 'compare'
                    })))
                    .call(createTooltipFocus)
                    .call(link(plotAllMedianPoints, createStructuredSelector({
                        visible: isVisibleSelector('median'),
                        xscale: xScaleSelector('current'),
                        yscale: yScaleSelector,
                        seriesMap: currentVariableTimeSeriesSelector('median'),
                        variable: currentVariableSelector,
                        showLabel: (state) => state.showMedianStatsLabel
                    })))
                    .append('g')
                    .call(link((elem, layout) => elem.attr('transform', `translate(${layout.margin.left},${layout.margin.top})`), layoutSelector))
                   // .call(link((elem, layout) => elem.attr('transform', 'scale(0.5)')
                    .call(watermark);
            });
    elem.append('div')
        .call(link(plotSROnlyTable, createStructuredSelector({
            tsKey: () => 'current',
            variable: currentVariableSelector,
            methods: methodsSelector,
            visible: isVisibleSelector('current'),
            dataByTsID: pointsTableDataSelector('current'),
            timeSeries: currentVariableTimeSeriesSelector('current')
    })));
    elem.append('div')
        .call(link(plotSROnlyTable, createStructuredSelector({
            tsKey: () => 'compare',
            variable: currentVariableSelector,
            methods: methodsSelector,
            visible: isVisibleSelector('compare'),
            dataByTsID: pointsTableDataSelector('compare'),
            timeSeries: currentVariableTimeSeriesSelector('compare')
    })));
    elem.append('div')
        .call(link(plotSROnlyTable, createStructuredSelector({
            tsKey: () => 'median',
            variable: currentVariableSelector,
            methods: methodsSelector,
            visible: isVisibleSelector('median'),
            dataByTsID: pointsTableDataSelector('median'),
            timeSeries: currentVariableTimeSeriesSelector('median')
    })));
};

/*
 * Create the show last year toggle and the audible toggle for the timeseries graph.
 * @param {Object} elem - D3 selection
 */
const graphControls = function(elem) {
    const graphControlDiv = elem.append('ul')
            .classed('usa-fieldset-inputs', true)
            .classed('usa-unstyled-list', true)
            .classed('graph-controls-container', true);

    graphControlDiv.call(link(function(elem, layout) {
        if (!mediaQuery(USWDS_MEDIUM_SCREEN)) {
            elem.style('padding-left', `${layout.margin.left}px`);
        } else {
            elem.style('padding-left', null);
        }
    }, layoutSelector));

    graphControlDiv.append('li')
        .call(audibleUI);

    const compareControlDiv = graphControlDiv.append('li');
    compareControlDiv.append('input')
        .attr('type', 'checkbox')
        .attr('id', 'last-year-checkbox')
        .attr('aria-labelledby', 'last-year-label')
        .attr('ga-on', 'click')
        .attr('ga-event-category', 'TimeseriesGraph')
        .attr('ga-event-action', 'toggleCompare')
        .on('click', dispatch(function() {
            return Actions.toggleTimeseries('compare', this.checked);
        }))
        // Disables the checkbox if no compare time series for the current variable
        .call(link(function(elem, compareTimeseries) {
            const exists = Object.keys(compareTimeseries) ?
                Object.values(compareTimeseries).filter(tsValues => tsValues.points.length).length > 0 : false;
            elem.property('disabled', !exists);
            if (!exists) {
                elem.property('checked', false);
                elem.dispatch('click');
            }
        }, currentVariableTimeSeriesSelector('compare')))
        // Sets the state of the toggle
        .call(link(function(elem, checked) {
            elem.property('checked', checked);
        }, isVisibleSelector('compare')));
    compareControlDiv.append('label')
        .attr('id', 'last-year-label')
        .attr('for', 'last-year-checkbox')
        .text('Show last year');
};

/**
 * Modify styling to hide or display the plot area.
 *
 * @param elem
 * @param currentTimeseries
 */
const controlGraphDisplay = function (elem, currentTimeseries) {
    const seriesWithPoints = Object.values(currentTimeseries).filter(x => x.points.length > 0);
    elem.attr('hidden', seriesWithPoints.length === 0 ? true : null);
};



const attachToNode = function (store, node, {siteno} = {}) {
    if (!siteno) {
        select(node).call(drawMessage, 'No data is available.');
        return;
    }

    store.dispatch(Actions.resizeUI(window.innerWidth, node.offsetWidth));
    select(node)
        .call(provide(store));
    select(node).select('.graph-container')
        .call(link(controlGraphDisplay, timeSeriesSelector('current')))
        .call(timeSeriesGraph)
        .call(cursorSlider)
        .append('div')
            .classed('ts-legend-controls-container', true)
            .call(timeSeriesLegend)
            .call(graphControls);
    select(node).select('.select-timeseries-container')
        .call(link(plotSeriesSelectTable, createStructuredSelector({
            availableTimeseries: availableTimeseriesSelector,
            lineSegmentsByParmCd: lineSegmentsByParmCdSelector('current'),
            timeSeriesScalesByParmCd: timeSeriesScalesByParmCdSelector('current')(SPARK_LINE_DIM),
            layout: layoutSelector
        })));
    select(node).select('.provisional-data-alert')
        .call(link(function(elem, allTimeSeries) {
            elem.attr('hidden', Object.keys(allTimeSeries).length ? null : true);

        }, allTimeSeriesSelector));


    window.onresize = function() {
        store.dispatch(Actions.resizeUI(window.innerWidth, node.offsetWidth));
    };
    store.dispatch(Actions.retrieveTimeseries(siteno));
};


module.exports = {attachToNode, timeSeriesLegend, timeSeriesGraph};
