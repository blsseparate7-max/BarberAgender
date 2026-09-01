// Utility for calculating non-overlapping side-by-side column layouts for calendar appointments and blocks

export interface LayoutItem {
  id: string;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  [key: string]: any;
}

export interface ItemPosition {
  colIndex: number;
  totalCols: number;
}

/**
 * Computes non-overlapping column indices and total columns for a list of items (appointments/blocks)
 * happening on the same day for a barber/column.
 * Ensures encaixes and simultaneous appointments appear side-by-side without visual overlap.
 */
export function computeOverlappingLayout(items: LayoutItem[]): Map<string, ItemPosition> {
  const result = new Map<string, ItemPosition>();
  if (!items || items.length === 0) return result;

  // 1. Convert time strings "HH:mm" to minutes from 00:00
  const parsedItems = items.map((it, idx) => {
    const sParts = (it.startTime || '00:00').split(':').map(Number);
    const eParts = (it.endTime || '00:00').split(':').map(Number);
    const start = (sParts[0] || 0) * 60 + (sParts[1] || 0);
    let end = (eParts[0] || 0) * 60 + (eParts[1] || 0);
    if (end <= start) {
      end = start + 30; // fallback minimum 30 min duration
    }
    const id = it.id || `item-${idx}-${it.startTime}`;
    return { id, it, start, end, duration: end - start };
  });

  // 2. Sort by start time ascending, then longer duration first
  parsedItems.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.duration - a.duration;
  });

  // 3. Group into overlapping clusters (connected components)
  const clusters: typeof parsedItems[] = [];
  let currentCluster: typeof parsedItems = [];
  let clusterEnd = -1;

  for (const item of parsedItems) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterEnd = item.end;
    } else {
      if (item.start < clusterEnd) {
        // Overlaps with current cluster
        currentCluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.end);
      } else {
        // New cluster
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterEnd = item.end;
      }
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // 4. Assign columns inside each cluster using greedy interval coloring
  for (const cluster of clusters) {
    const columnEnds: number[] = [];
    const clusterAssignments: { id: string; colIndex: number; start: number; end: number }[] = [];

    for (const item of cluster) {
      let placedCol = -1;
      for (let c = 0; c < columnEnds.length; c++) {
        if (columnEnds[c] <= item.start) {
          placedCol = c;
          columnEnds[c] = item.end;
          break;
        }
      }

      if (placedCol === -1) {
        placedCol = columnEnds.length;
        columnEnds.push(item.end);
      }

      clusterAssignments.push({ id: item.id, colIndex: placedCol, start: item.start, end: item.end });
    }

    const totalCols = Math.max(1, columnEnds.length);
    for (const assign of clusterAssignments) {
      result.set(assign.id, { colIndex: assign.colIndex, totalCols });
    }
  }

  return result;
}
