<script setup lang="ts">
import { ref } from 'vue';
import BaseButton from '../atoms/BaseButton.vue';

interface Props {
  initialName?: string;
  busy?: boolean;
}

const props = withDefaults(defineProps<Props>(), { initialName: '', busy: false });
const emit = defineEmits<{ (e: 'submit', name: string): void }>();

const name = ref(props.initialName);

function submit(): void {
  emit('submit', name.value.trim());
}
</script>

<template>
  <form class="join-form" @submit.prevent="submit">
    <label class="join-form__label" for="join-name">Your name</label>
    <input
      id="join-name"
      v-model="name"
      class="join-form__input"
      maxlength="16"
      autocomplete="nickname"
      placeholder="e.g. Flipper Queen"
      enterkeyhint="go"
    >
    <BaseButton type="submit" block :disabled="busy">
      {{ busy ? 'Joining…' : 'Join the queue' }}
    </BaseButton>
  </form>
</template>

<style lang="scss" scoped>
.join-form {
  @include card;
  display: flex;
  flex-direction: column;
  gap: spacing(md);
  width: 100%;
  max-width: size(field);

  &__label {
    @include display-text(sm);
    color: color(text-muted);
  }

  &__input {
    padding: spacing(sm) spacing(md);
    border-radius: radius(md);
    border: border-width(thin) solid color(border);
    background: color(bg);
    font-size: font-size(lg);
    @include focus-ring;
  }
}
</style>
