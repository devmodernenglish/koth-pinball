<script setup lang="ts">
import { onMounted, ref } from 'vue';
import QRCode from 'qrcode';
import { MAX_SPECTATOR_POINTS } from '@koth/shared';
import { useGameStore } from '@/stores/game';
import QueueList from '../molecules/QueueList.vue';
import StatusBadge from '../atoms/StatusBadge.vue';

const store = useGameStore();
const playUrl = ref('');
const qrDataUrl = ref('');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

async function resolvePlayUrl(): Promise<string> {
  const fallback = `${location.origin}/play`;
  if (!LOCAL_HOSTS.has(location.hostname)) return fallback;
  try {
    const res = await fetch('/api/info');
    const info = (await res.json()) as { lanIp?: string };
    return info.lanIp ? `${location.protocol}//${info.lanIp}:${location.port || 80}/play` : fallback;
  } catch {
    return fallback;
  }
}

onMounted(async () => {
  playUrl.value = await resolvePlayUrl();
  const style = getComputedStyle(document.documentElement);
  qrDataUrl.value = await QRCode.toDataURL(playUrl.value, {
    margin: 1,
    width: 512,
    color: { dark: style.getPropertyValue('--color-bg').trim(), light: style.getPropertyValue('--color-white').trim() },
  });
});
</script>

<template>
  <div class="cabinet-sidebar">
    <section class="cabinet-sidebar__join">
      <h2 class="cabinet-sidebar__title">Scan to play</h2>
      <img v-if="qrDataUrl" class="cabinet-sidebar__qr" :src="qrDataUrl" :alt="`QR code for ${playUrl}`">
      <a class="cabinet-sidebar__url" :href="playUrl" target="_blank" rel="noopener">{{ playUrl }}</a>
    </section>

    <QueueList :entries="store.queueEntries" :max-points="MAX_SPECTATOR_POINTS" />

    <section class="cabinet-sidebar__rules">
      <h2 class="cabinet-sidebar__title">How it works</h2>
      <ul class="cabinet-sidebar__list">
        <li>One ball, two halves. Drain on your side and you’re out.</li>
        <li>Winner stays on. The next challenger serves first.</li>
        <li>Waiting? Earn ★ every second and spend them on hazards.</li>
      </ul>
    </section>

    <div class="cabinet-sidebar__status">
      <StatusBadge :label="store.connected ? 'Connected' : 'No server'" :tone="store.connected ? 'live' : 'off'" />
      <StatusBadge :label="`${store.humanCount} human${store.humanCount === 1 ? '' : 's'}`" tone="human" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.cabinet-sidebar {
  display: flex;
  flex-direction: column;
  gap: spacing(md);

  &__join,
  &__rules {
    @include card;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: spacing(sm);
  }

  &__rules {
    align-items: stretch;
  }

  &__title {
    @include display-text(sm);
    margin: 0;
    color: color(primary);
  }

  &__qr {
    width: size(qr);
    aspect-ratio: 1;
    border-radius: radius(md);
    image-rendering: pixelated;
  }

  &__url {
    font-family: font(mono);
    font-size: font-size(xs);
    color: color(text-muted);
    word-break: break-all;
    text-align: center;
  }

  &__list {
    margin: 0;
    padding-left: spacing(md);
    display: flex;
    flex-direction: column;
    gap: spacing(xs);
    color: color(text-muted);
    font-size: font-size(sm);
  }

  &__status {
    display: flex;
    flex-wrap: wrap;
    gap: spacing(sm);
  }
}
</style>
