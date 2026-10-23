import React from 'react';
import { Box, VStack, Spinner, Text, Flex } from '@chakra-ui/react';
import AppCardComponent from './AppCardComponent';
import SearchBarComponent from './SearchBarComponent';
import { useAppManager } from './AppManagerContext';

const AppListComponent = () => {
  const {
    data,
    selectedAppId,
    setSelectedAppId,
    setSelectedInstanceId,
    handleSearch,
    setIsSettingsOpen,
    instances,
  } = useAppManager();

  return (
    <Box
      w={{ base: '168px', md: '232px' }}
      flexShrink={0}
      bg="gray.50"
      borderRightWidth="1px"
      borderColor="gray.200"
      display="flex"
      flexDirection="column"
      minH={0}
    >
      <Box px={3} pt={3} pb={2}>
        <Text
          fontSize="xs"
          fontWeight="600"
          color="gray.500"
          letterSpacing="0.06em"
          mb={2}
        >
          平台
        </Text>
        <SearchBarComponent onSearch={handleSearch} />
      </Box>
      <VStack
        spacing={1}
        align="stretch"
        overflowY="auto"
        flex="1"
        px={2}
        pb={3}
      >
        {data?.data && data?.data.length > 0 ? (
          data.data.map((app, i) => (
            <AppCardComponent
              key={i}
              app={app}
              selectedAppId={selectedAppId}
              setSelectedAppId={setSelectedAppId}
              openSettings={() => {
                setSelectedAppId(app.id);
                setSelectedInstanceId(null);
                setIsSettingsOpen(true);
              }}
              instances={instances}
            />
          ))
        ) : (
          <Flex
            justifyContent="center"
            alignItems="center"
            direction="column"
            py={8}
            color="gray.500"
          >
            <Spinner size="md" mb={3} />
            <Text fontSize="sm">启动服务中...</Text>
          </Flex>
        )}
      </VStack>
    </Box>
  );
};

export default AppListComponent;
