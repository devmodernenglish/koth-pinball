<script setup lang="ts">
import PlayLayout from '@/components/templates/PlayLayout.vue';
import ControllerPanel from '@/components/organisms/ControllerPanel.vue';
</script>

<template>
  <PlayLayout>
    <template #header>
      <h1 class="play-view__title">♛ King of the Hill <span class="play-view__accent">Pinball</span></h1>
    </template>
    <ControllerPanel />
  </PlayLayout>
</template>

<style lang="scss" scoped>
.play-view {
  &__title {
    @include display-text(lg);
    margin: 0;
    text-align: center;
  }

  &__accent {
    color: color(primary);
  }
}
</style>
