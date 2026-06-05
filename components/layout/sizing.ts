export const HORIZONTAL_COOKIE = 'vp:layout:h'
export const VERTICAL_COOKIE = 'vp:layout:v'
export const getHorizontal = getSizes(HORIZONTAL_COOKIE)
export const getVertical = getSizes(VERTICAL_COOKIE)

function getSizes(cookie: string) {
  return (store: {
    get: (key: string) => { value: string } | undefined
  }): number[] | undefined => {
    const value = store.get(cookie)
    return value ? JSON.parse(value.value) : undefined
  }
}
