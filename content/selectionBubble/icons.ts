/**
 * Inline SVG icons for selection bubble actions (16×16 stroke).
 */

type IconName =
  | 'copy'
  | 'retry'
  | 'speak'
  | 'stop'
  | 'glossary'
  | 'pin'
  | 'close'
  | 'chevron';

function svgRoot(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

function path(d: string): SVGPathElement {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  return p;
}

function rect(
  x: string,
  y: string,
  w: string,
  h: string,
  rx?: string,
): SVGRectElement {
  const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  r.setAttribute('x', x);
  r.setAttribute('y', y);
  r.setAttribute('width', w);
  r.setAttribute('height', h);
  if (rx) r.setAttribute('rx', rx);
  return r;
}

function polyline(points: string): SVGPolylineElement {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  p.setAttribute('points', points);
  return p;
}

function line(x1: string, y1: string, x2: string, y2: string): SVGLineElement {
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', x1);
  l.setAttribute('y1', y1);
  l.setAttribute('x2', x2);
  l.setAttribute('y2', y2);
  return l;
}

function polygon(points: string): SVGPolygonElement {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  p.setAttribute('points', points);
  return p;
}

/** Create a 16×16 stroke icon for selection bubble actions. */
export function createIcon(name: IconName): SVGSVGElement {
  const svg = svgRoot();

  switch (name) {
    case 'copy': {
      svg.appendChild(rect('9', '9', '13', '13', '2'));
      svg.appendChild(path('M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1'));
      break;
    }
    case 'retry': {
      svg.appendChild(
        path('M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15'),
      );
      break;
    }
    case 'speak': {
      svg.appendChild(polygon('11 5 6 9 2 9 2 15 6 15 11 19 11 5'));
      svg.appendChild(path('M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07'));
      break;
    }
    case 'stop': {
      svg.appendChild(rect('6', '6', '12', '12', '2'));
      break;
    }
    case 'glossary': {
      svg.appendChild(path('M4 19.5A2.5 2.5 0 016.5 17H20'));
      svg.appendChild(path('M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z'));
      break;
    }
    case 'pin': {
      svg.appendChild(path('M12 17v5M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V5a1 1 0 00-1-1h-4a1 1 0 00-1 1v5.76z'));
      break;
    }
    case 'close': {
      svg.appendChild(line('18', '6', '6', '18'));
      svg.appendChild(line('6', '6', '18', '18'));
      break;
    }
    case 'chevron': {
      svg.appendChild(polyline('6 9 12 15 18 9'));
      break;
    }
  }

  return svg;
}
