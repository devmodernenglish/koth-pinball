<script setup lang="ts"></script>

<template>
  <div class="play-layout">
    <header class="play-layout__header">
      <slot name="header" />
    </header>
    <main class="play-layout__main">
      <slot />
    </main>
  </div>
</template>

<style lang="scss" scoped>
.play-layout {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  height: 100dvh;
  padding: spacing(md);
  padding-bottom: max(spacing(md), env(safe-area-inset-bottom));
  gap: spacing(md);

  &__header {
    flex: none;
  }

  &__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
}
</style>
