import type { Direction, WorldPoint } from "./types";

export interface Size {
  width: number;
  height: number;
}

export function clonePoint(point: WorldPoint): WorldPoint {
  return { x: point.x, y: point.y };
}

export function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function normalize(vector: WorldPoint): WorldPoint {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function directionFromVector(vector: WorldPoint, fallback: Direction): Direction {
  if (Math.abs(vector.x) < 0.001 && Math.abs(vector.y) < 0.001) {
    return fallback;
  }

  const angle = (Math.atan2(vector.y, vector.x) * 180) / Math.PI;

  if (angle >= -22.5 && angle < 22.5) {
    return "right";
  }
  if (angle >= 22.5 && angle < 67.5) {
    return "down-right";
  }
  if (angle >= 67.5 && angle < 112.5) {
    return "down";
  }
  if (angle >= 112.5 && angle < 157.5) {
    return "down-left";
  }
  if (angle >= 157.5 || angle < -157.5) {
    return "left";
  }
  if (angle >= -157.5 && angle < -112.5) {
    return "up-left";
  }
  if (angle >= -112.5 && angle < -67.5) {
    return "up";
  }

  return "up-right";
}

export function isInsideWorld(point: WorldPoint, worldSize: Size, radius: number): boolean {
  return (
    point.x >= radius &&
    point.y >= radius &&
    point.x <= worldSize.width - radius &&
    point.y <= worldSize.height - radius
  );
}

export function pointInPolygon(point: WorldPoint, polygon: WorldPoint[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const current = polygon[i];
    const previous = polygon[j];
    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function distanceToSegment(point: WorldPoint, a: WorldPoint, b: WorldPoint): number {
  const segmentX = b.x - a.x;
  const segmentY = b.y - a.y;
  const lengthSq = segmentX * segmentX + segmentY * segmentY;

  if (lengthSq === 0) {
    return distance(point, a);
  }

  const t = clamp(
    ((point.x - a.x) * segmentX + (point.y - a.y) * segmentY) / lengthSq,
    0,
    1
  );

  return distance(point, {
    x: a.x + t * segmentX,
    y: a.y + t * segmentY
  });
}

export function circleIntersectsPolygon(
  center: WorldPoint,
  radius: number,
  polygon: WorldPoint[]
): boolean {
  if (pointInPolygon(center, polygon)) {
    return true;
  }

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];

    if (distanceToSegment(center, a, b) <= radius) {
      return true;
    }
  }

  return false;
}

export function polygonsIntersect(a: WorldPoint[], b: WorldPoint[]): boolean {
  for (const point of a) {
    if (pointInPolygon(point, b)) {
      return true;
    }
  }

  for (const point of b) {
    if (pointInPolygon(point, a)) {
      return true;
    }
  }

  for (let aIndex = 0; aIndex < a.length; aIndex += 1) {
    const aStart = a[aIndex];
    const aEnd = a[(aIndex + 1) % a.length];

    for (let bIndex = 0; bIndex < b.length; bIndex += 1) {
      const bStart = b[bIndex];
      const bEnd = b[(bIndex + 1) % b.length];

      if (segmentsIntersect(aStart, aEnd, bStart, bEnd)) {
        return true;
      }
    }
  }

  return false;
}

export function segmentsIntersect(a: WorldPoint, b: WorldPoint, c: WorldPoint, d: WorldPoint): boolean {
  const orientation = (p: WorldPoint, q: WorldPoint, r: WorldPoint): number =>
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);

  const onSegment = (p: WorldPoint, q: WorldPoint, r: WorldPoint): boolean =>
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y);

  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 * o2 < 0 && o3 * o4 < 0) {
    return true;
  }

  if (Math.abs(o1) < 0.0001 && onSegment(a, c, b)) {
    return true;
  }
  if (Math.abs(o2) < 0.0001 && onSegment(a, d, b)) {
    return true;
  }
  if (Math.abs(o3) < 0.0001 && onSegment(c, a, d)) {
    return true;
  }
  if (Math.abs(o4) < 0.0001 && onSegment(c, b, d)) {
    return true;
  }

  return false;
}

export function getPolygonCenter(points: WorldPoint[]): WorldPoint {
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length
  };
}

export function getMaxY(points: WorldPoint[]): number {
  return points.reduce((maxY, point) => Math.max(maxY, point.y), -Infinity);
}
