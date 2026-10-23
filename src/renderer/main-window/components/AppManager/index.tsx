import React, { useEffect } from 'react';
import { Flex, Stack, Skeleton } from '@chakra-ui/react';
import AppListComponent from './AppListComponent';
import InstanceListComponent from './InstanceListComponent';
import { AppManagerProvider, useAppManager } from './AppManagerContext';

const LoadingSkeleton = () => (
  <Stack w="240px" spacing={3}>
    <Skeleton height="36px" borderRadius="md" />
    <Skeleton height="36px" borderRadius="md" />
    <Skeleton height="36px" borderRadius="md" />
  </Stack>
);

const AppManagerContent = () => {
  const {
    data,
    isLoading,
    isSettingsOpen,
    setIsSettingsOpen,
    selectedAppId,
    selectedInstanceId,
  } = useAppManager();

  const handleOpenSettings = () => {
    window.electron.ipcRenderer.sendMessage('open-settings-window', {
      appId: selectedAppId,
      instanceId: selectedInstanceId,
    });
  };

  useEffect(() => {
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      handleOpenSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppId, selectedInstanceId, isSettingsOpen, setIsSettingsOpen]);

  if (isLoading || !data || !data.data) {
    return (
      <Flex
        h="100%"
        align="center"
        justify="center"
        bg="white"
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
      >
        <LoadingSkeleton />
      </Flex>
    );
  }

  return (
    <Flex
      h="100%"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      overflow="hidden"
    >
      <AppListComponent />
      <InstanceListComponent />
    </Flex>
  );
};

const AppManagerComponent = () => {
  return (
    <AppManagerProvider>
      <AppManagerContent />
    </AppManagerProvider>
  );
};

export default React.memo(AppManagerComponent);
