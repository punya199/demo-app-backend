export const permissionActionHelper = (action: string) => {
  const [canRead, canCreate, canUpdate, canDelete] = action?.split('') || ['0', '0', '0', '0']

  return {
    canRead: canRead === '1',
    canCreate: canCreate === '1',
    canUpdate: canUpdate === '1',
    canDelete: canDelete === '1',
  }
}
