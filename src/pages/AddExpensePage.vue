<script setup lang="ts">
import { computed } from 'vue'
import ExpenseForm from '../components/ExpenseForm.vue'
import { useExpenses } from '../composables/useExpenses'
import { toast } from '../composables/useToast'
import { toUserMessage } from '../utils/userMessage'

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

const formatDebugError = (error: unknown) => {
  const supabaseError = error as { code?: string; message?: string; details?: string | null; hint?: string | null }
  const parts = [
    supabaseError?.code ? `code=${supabaseError.code}` : '',
    supabaseError?.message ? `message=${supabaseError.message}` : '',
    supabaseError?.details ? `details=${supabaseError.details}` : '',
    supabaseError?.hint ? `hint=${supabaseError.hint}` : '',
  ].filter(Boolean)

  return parts.length ? `（${parts.join(' | ')}）` : ''
}

const handleSave = async (expense: (typeof expenses.value)[number]) => {
  try {
    if (editingExpense.value) {
      const result = await updateExpense(expense)
      if (result.status === 'local_fallback') {
        toast.warning(`本地已保存，但云端同步失败，对方暂时看不到${import.meta.env.DEV ? formatDebugError(result.error) : ''}`)
        emit('saved', '')
        return
      }
      emit('saved', '记录已更新。')
      return
    }

    const result = await addExpense(expense)
    if (result.status === 'local_fallback') {
      toast.warning(`本地已保存，但云端同步失败，对方暂时看不到${import.meta.env.DEV ? formatDebugError(result.error) : ''}`)
      emit('saved', '')
      return
    }
    emit('saved', '记录已保存。')
  } catch (error) {
    console.error('保存消费失败：', error)
    const fallback = `保存失败，请稍后重试。${import.meta.env.DEV ? formatDebugError(error) : ''}`
    toast.error(toUserMessage(error, fallback))
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
