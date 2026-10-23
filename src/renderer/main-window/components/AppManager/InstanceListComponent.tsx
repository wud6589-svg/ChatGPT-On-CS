import React, { useEffect, useState } from 'react';
import {
  Box,
  VStack,
  Text,
  Flex,
  Button,
  Spinner,
  useToast,
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import InstanceCardComponent from './InstanceCardComponent';
import { useAppManager } from './AppManagerContext';
import { trackButtonClick } from '../../../common/services/analytics';

const EmptyHint = ({ title, detail }: { title: string; detail: string }) => (
  <Flex
    direction="column"
    align="center"
    justify="center"
    flex="1"
    px={6}
    textAlign="center"
  >
    <Flex
      boxSize="40px"
      borderRadius="full"
      bg="teal.50"
      align="center"
      justify="center"
      mb={3}
      color="teal.600"
      fontWeight="600"
    >
      客
    </Flex>
    <Text fontSize="md" fontWeight="600" color="gray.700">
      {title}
    </Text>
    <Text fontSize="sm" color="gray.500" mt={2} maxW="280px">
      {detail}
    </Text>
  </Flex>
);

const InstanceListComponent = () => {
  const {
    data,
    filteredInstances,
    selectedInstanceId,
    selectedAppId,
    isTasksLoading,
    setSelectedInstanceId,
    handleDelete,
    handleAddTask,
    setIsSettingsOpen,
  } = useAppManager();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [currentAppId, setCurrentAppId] = useState(selectedAppId);
  const toast = useToast();
  const selectedApp = data?.data?.find((app) => app.id === selectedAppId);

  useEffect(() => {
    setCurrentAppId(selectedAppId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppId]);

  const handleAddTaskWrapper = async () => {
    try {
      trackButtonClick(`add_task_${selectedAppId || ''}`);
      await handleAddTask();
    } catch (error) {
      toast({
        title: '添加失败',
        description: (error as Error).message || '未知错误',
        position: 'top',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  let content;

  if (!selectedAppId) {
    content = (
      <EmptyHint
        title="请先选择一个平台"
        detail="在左侧点选拼多多或其他平台。选中后再新增客服，每个客服使用独立窗口。"
      />
    );
  } else if (filteredInstances.length > 0) {
    content = (
      <VStack spacing={2} align="stretch" w="100%">
        {filteredInstances.map((instance, i) => (
          <InstanceCardComponent
            key={i}
            instance={instance}
            selectedInstanceId={selectedInstanceId}
            setSelectedInstanceId={setSelectedInstanceId}
            handleDelete={handleDelete}
            openSettings={() => setIsSettingsOpen(true)}
          />
        ))}
      </VStack>
    );
  } else {
    content = (
      <EmptyHint
        title="还没有客服"
        detail="点下方新增。拼多多会用本机 Chrome 打开商家工作台，登录一次即可。"
      />
    );
  }

  return (
    <Flex direction="column" flex="1" minW={0} minH={0} bg="white">
      <Flex
        px={4}
        h="48px"
        align="center"
        justify="space-between"
        borderBottomWidth="1px"
        borderColor="gray.100"
        flexShrink={0}
      >
        <Box minW={0}>
          <Text fontSize="sm" fontWeight="600" color="gray.800" noOfLines={1}>
            {selectedApp?.name || '客服'}
          </Text>
        </Box>
        {selectedAppId && (
          <Text fontSize="xs" color="gray.500">
            {filteredInstances.length} 个
          </Text>
        )}
      </Flex>
      <Flex direction="column" flex="1" minH={0} overflowY="auto" p={4}>
        {content}
        {selectedAppId &&
          (isTasksLoading ? (
            <Flex justify="center" align="center" w="100%" h="44px" mt={3}>
              <Spinner size="sm" />
            </Flex>
          ) : (
            <Button
              mt={3}
              w="100%"
              variant="outline"
              borderStyle="dashed"
              colorScheme="teal"
              leftIcon={<AddIcon />}
              onClick={handleAddTaskWrapper}
            >
              新增客服
            </Button>
          ))}
      </Flex>
    </Flex>
  );
};

export default InstanceListComponent;
