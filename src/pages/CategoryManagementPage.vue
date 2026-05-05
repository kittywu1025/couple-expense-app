<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { ExpenseCategory, RecordType } from '../types'
import { useSettings } from '../composables/useSettings'
import { useExpenses } from '../composables/useExpenses'
import { toast } from '../composables/useToast'

defineEmits<{
  (e: 'back'): void
}>()

const { settings } = useSettings()
const { expenses } = useExpenses()

const newCategory = reactive<Record<RecordType, { name: string; icon: string }>>({
  expense: { name: '', icon: '🧾' },
  income: { name: '', icon: '💼' },
})

const expenseCategories = computed(() => settings.value.categories.filter((item) => item.recordType === 'expense'))
const incomeCategories = computed(() => settings.value.categories.filter((item) => item.recordType === 'income'))

const isCategoryUsed = (categoryId: string) => expenses.value.some((item) => item.category === categoryId)

const activeCount = (recordType: RecordType) =>
  settings.value.categories.filter((item) => item.recordType === recordType && item.active).length

const addCategory = (recordType: RecordType) => {
  const draft = newCategory[recordType]
  const name = draft.name.trim()
  if (!name) {
    toast.warning(`请填写新的${recordType === 'expense' ? '支出' : '收入'}分类名称。`)
    return
  }

  settings.value.categories.push({
    id: crypto.randomUUID(),
    name,
    icon: draft.icon.trim() || (recordType === 'expense' ? '🧾' : '💼'),
    recordType,
    active: true,
    isDefault: false,
  })

  draft.name = ''
  draft.icon = recordType === 'expense' ? '🧾' : '💼'
  toast.success('分类已添加。')
}

const toggleCategory = (category: ExpenseCategory) => {
  if (category.active && activeCount(category.recordType) <= 1) {
    toast.warning('每种类型至少保留一个启用分类。')
    return
  }
  category.active = !category.active
  toast.success(category.active ? '分类已启用。' : '分类已停用。')
}

const deleteCategory = (category: ExpenseCategory) => {
  if (category.isDefault || isCategoryUsed(category.id)) {
    if (category.active && activeCount(category.recordType) <= 1) {
      toast.warning('每种类型至少保留一个启用分类。')
      return
    }
    category.active = false
    toast.info('旧记录仍保留这个分类，当前已停用。')
    return
  }

  settings.value.categories = settings.value.categories.filter((item) => item.id !== category.id)
  toast.success('分类已删除。')
}
</script>

<template>
  <section class="page-stack">
    <section class="section-card">
      <div class="section-heading">
        <div>
          <h2>分类管理</h2>
        </div>
        <button type="button" class="secondary-button" @click="$emit('back')">返回</button>
      </div>
      <p class="settings-hint">支出和收入分开管理。删除有历史记录的分类时，会自动改为停用，避免旧记录显示异常。</p>
    </section>

    <section class="section-card">
      <div class="section-heading compact">
        <div>
          <h3>支出分类</h3>
        </div>
      </div>

      <div class="category-manage-list">
        <div v-for="category in expenseCategories" :key="category.id" class="category-manage-item">
          <div class="category-name">
            <input v-model="category.icon" type="text" maxlength="2" class="emoji-input" />
            <input v-model="category.name" type="text" />
          </div>
          <div class="category-manage-actions">
            <span class="info-pill soft">{{ category.active ? '启用中' : '已停用' }}</span>
            <button type="button" class="text-button" @click="toggleCategory(category)">
              {{ category.active ? '停用' : '启用' }}
            </button>
            <button type="button" class="text-button danger" @click="deleteCategory(category)">删除</button>
          </div>
        </div>
      </div>

      <div class="field-row">
        <label class="field-group">
          <span class="field-label">新支出分类</span>
          <input v-model="newCategory.expense.name" type="text" placeholder="例如：宠物、旅行" />
        </label>
        <label class="field-group tiny-field">
          <span class="field-label">图标</span>
          <input v-model="newCategory.expense.icon" type="text" maxlength="2" />
        </label>
      </div>

      <div class="form-actions">
        <button type="button" class="secondary-button" @click="addCategory('expense')">新增支出分类</button>
      </div>
    </section>

    <section class="section-card">
      <div class="section-heading compact">
        <div>
          <h3>收入分类</h3>
        </div>
      </div>

      <div class="category-manage-list">
        <div v-for="category in incomeCategories" :key="category.id" class="category-manage-item">
          <div class="category-name">
            <input v-model="category.icon" type="text" maxlength="2" class="emoji-input" />
            <input v-model="category.name" type="text" />
          </div>
          <div class="category-manage-actions">
            <span class="info-pill soft">{{ category.active ? '启用中' : '已停用' }}</span>
            <button type="button" class="text-button" @click="toggleCategory(category)">
              {{ category.active ? '停用' : '启用' }}
            </button>
            <button type="button" class="text-button danger" @click="deleteCategory(category)">删除</button>
          </div>
        </div>
      </div>

      <div class="field-row">
        <label class="field-group">
          <span class="field-label">新收入分类</span>
          <input v-model="newCategory.income.name" type="text" placeholder="例如：奖学金、退税" />
        </label>
        <label class="field-group tiny-field">
          <span class="field-label">图标</span>
          <input v-model="newCategory.income.icon" type="text" maxlength="2" />
        </label>
      </div>

      <div class="form-actions">
        <button type="button" class="secondary-button" @click="addCategory('income')">新增收入分类</button>
      </div>
    </section>
  </section>
</template>
