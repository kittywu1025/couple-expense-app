import { computed } from 'vue'
import { useSettings } from './useSettings'

export function useUsers() {
  const { settings } = useSettings()

  const userConfig = computed({
    get: () => ({
      meName: settings.value.meName,
      partnerName: settings.value.partnerName,
    }),
    set: (value: { meName: string; partnerName: string }) => {
      settings.value.meName = value.meName
      settings.value.partnerName = value.partnerName
    },
  })

  return {
    userConfig,
  }
}
