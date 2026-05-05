<script setup lang="ts">
import { computed, ref } from 'vue'
import ExpenseList from '../components/ExpenseList.vue'
import { getEffectiveExpenseDate, useExpenses } from '../composables/useExpenses'
import { useSettings } from '../composables/useSettings'
import { toast } from '../composables/useToast'

const emit = defineEmits<{
  (e: 'edit', expenseId: string): void
  (e: 'deleted'): void
}>()

const { settings, categoryMap } = useSettings()
const { filteredExpenses, deleteExpense, selectedYearMonth } = useExpenses()

const searchText = ref('')
const payerFilter = ref<'all' | 'me' | 'partner'>('all')
const categoryFilter = ref('all')
const pendingDeleteId = ref<string | null>(null)

const filteredList = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()

  return filteredExpenses.value.filter((item) => {
    const matchesPayer = payerFilter.value === 'all' || item.payer === payerFilter.value
    const matchesCategory = categoryFilter.value === 'all' || item.category === categoryFilter.value
    const matchesKeyword =
      !keyword ||
      [
        item.title,
        item.note,
        categoryMap.value[item.category]?.name,
        settings.value.meName,
        settings.value.partnerName,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword)

    return matchesPayer && matchesCategory && matchesKeyword
  })
})

const requestDelete = (id: string) => {
  pendingDeleteId.value = id
}

const closeDeleteModal = () => {
  pendingDeleteId.value = null
}

const confirmDelete = async () => {
  if (!pendingDeleteId.value) return
  const { error } = await deleteExpense(pendingDeleteId.value)
  if (error) {
    toast.error('云端删除失败，请稍后重试。')
    return
  }
  pendingDeleteId.value = null
  emit('deleted')
}
</script>

<template>
  <section class="page-stack">
    <section class="section-card">
      <div class="section-heading">
        <div>
          <h2>记录</h2>
        </div>
      </div>

      <div class="filter-toolbar">
        <label class="field-group">
          <span class="field-label">月份</span>
          <input v-model="selectedYearMonth" type="month" />
        </label>

        <label class="field-group">
          <span class="field-label">付款人</span>
          <select v-model="payerFilter">
            <option value="all">全部</option>
            <option value="me">{{ settings.meName }}</option>
            <option value="partner">{{ settings.partnerName }}</option>
          </select>
        </label>

        <label class="field-group">
          <span class="field-label">类别</span>
          <select v-model="categoryFilter">
            <option value="all">全部</option>
            <option
              v-for="category in settings.categories"
              :key="category.id"
              :value="category.id"
            >
              {{ category.name }}
            </option>
          </select>
        </label>

        <label class="field-group search-field">
          <span class="field-label">搜索</span>
          <input v-model="searchText" type="search" placeholder="搜索说明、类别" />
        </label>
      </div>
    </section>

    <section class="section-card">
      <div class="section-heading">
        <div>
          <p class="section-kicker">共 {{ filteredList.length }} 笔</p>
          <h3>结果</h3>
        </div>
      </div>

      <ExpenseList
        :expenses="filteredList"
        :effective-date="(expense) => getEffectiveExpenseDate(expense, selectedYearMonth)"
        @edit="emit('edit', $event.id)"
        @delete="requestDelete"
      />
    </section>

    <div
      v-if="pendingDeleteId"
      class="settings-modal-overlay"
      @click.self="closeDeleteModal"
    >
      <section class="settings-modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-expense-title">
        <div class="section-heading compact">
          <div>
            <h3 id="delete-expense-title">确定删除这笔记录吗？</h3>
          </div>
        </div>
        <p class="delete-modal-copy">删除后无法恢复。</p>
        <div class="settings-modal-actions">
          <button type="button" class="secondary-button" @click="closeDeleteModal">取消</button>
          <button type="button" class="primary-button danger-button" @click="confirmDelete">删除</button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.settings-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  padding: 16px;
  z-index: 40;
}

.settings-modal {
  width: min(100%, 360px);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.82);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.14);
  padding: 16px;
  display: grid;
  gap: 10px;
}

.delete-modal-copy {
  margin: 0;
  color: var(--text-soft);
  font-size: 0.84rem;
}

.danger-button {
  background: linear-gradient(180deg, #f47c73 0%, #e35d54 100%);
  color: #fff;
  border-color: rgba(227, 93, 84, 0.26);
  box-shadow: none;
}
</style>
