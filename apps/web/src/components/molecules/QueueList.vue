<script setup lang="ts">
import PlayerTag from '../atoms/PlayerTag.vue';
import PointsChip from '../atoms/PointsChip.vue';

export interface QueueEntry {
  id: string;
  name: string;
  points: number;
}

interface Props {
  entries: QueueEntry[];
  maxPoints?: number;
  highlightId?: string | null;
}

withDefaults(defineProps<Props>(), { maxPoints: 0, highlightId: null });
</script>

<template>
  <section class="queue-list">
    <h2 class="queue-list__title">Next challengers</h2>
    <ol v-if="entries.length > 0" class="queue-list__items">
      <li
        v-for="(entry, i) in entries"
        :key="entry.id"
        :class="['queue-list__item', { 'queue-list__item--me': entry.id === highlightId, 'queue-list__item--next': i === 0 }]"
      >
        <span class="queue-list__position">{{ i + 1 }}</span>
        <PlayerTag :name="entry.name" />
        <PointsChip :points="entry.points" :max="maxPoints" />
      </li>
    </ol>
    <p v-else class="queue-list__empty">Nobody waiting. Scan to play!</p>
  </section>
</template>

<style lang="scss" scoped>
.queue-list {
  display: flex;
  flex-direction: column;
  gap: spacing(sm);
  min-height: 0;

  &__title {
    @include display-text(sm);
    margin: 0;
    color: color(text-muted);
  }

  &__items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: spacing(xs);
    overflow-y: auto;
  }

  &__item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: spacing(sm);
    padding: spacing(xs) spacing(sm);
    border-radius: radius(md);
    background: color(surface-raised);
    min-width: 0;

    &--next {
      border: border-width(hairline) solid color(primary);
    }

    &--me {
      background: color(player-b-soft);
    }
  }

  &__position {
    font-family: font(display);
    font-weight: 900;
    color: color(primary);
  }

  &__empty {
    margin: 0;
    color: color(text-muted);
  }
}
</style>
