<script setup lang="ts">
import { computed } from 'vue'
import ExpenseForm from '../components/ExpenseForm.vue'
import { useExpenses } from '../composables/useExpenses'
import { clearAppError, setAppError } from '../composables/useRuntimeStatus'

const props = defineProps<{
  expenseId?: string | null
}>()

const emit = defineEmits<{
  (e: 'saved', message: string): void
  (e: 'cancel'): void
}>()

const { expenses, addExpense, updateExpense } = useExpenses()

const editingExpense = computed(() =>
  props.expenseId ? expenses.value.find((item) => item.id === props.expenseId) || null : null
)

const handleSave = async (expense: (typeof expenses.value)[number]) => {
  clearAppError()

  try {
    if (editingExpense.value) {
      await updateExpense(expense)
      emit('saved', '记录已更新。')
      return
    }

    await addExpense(expense)
    emit('saved', '记录已保存。')
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败，请重试。'
    setAppError(message)
  }
}
</script>

<template>
  <section class="page-card">
    <ExpenseForm
      :expense="editingExpense"
      :submit-label="editingExpense ? '更新记录' : '保存并返回'"
      @save="handleSave"
      @cancel="emit('cancel')"
    />
  </section>
</template>
