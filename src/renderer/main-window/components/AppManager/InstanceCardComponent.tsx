import React from 'react';
import { Flex, Image, Text, HStack, IconButton } from '@chakra-ui/react';
import { SettingsIcon, DeleteIcon } from '@chakra-ui/icons';
import defaultPlatformIcon from '../../../../../assets/base/default-platform-icon.png';

type InstanceCardComponentProps = {
  instance: {
    task_id: string;
    app_id: string;
    env_id: string;
    avatar?: string;
  };
  selectedInstanceId: string | null;
  setSelectedInstanceId: React.Dispatch<React.SetStateAction<string | null>>;
  handleDelete: (taskId: string) => void;
  openSettings: () => void;
};

const InstanceCardComponent = ({
  instance,
  selectedInstanceId,
  setSelectedInstanceId,
  handleDelete,
  openSettings,
}: InstanceCardComponentProps) => {
  const selected = selectedInstanceId === instance.task_id;

  return (
    <Flex
      w="100%"
      minH="52px"
      bg={selected ? 'teal.50' : 'gray.50'}
      borderWidth="1px"
      borderColor={selected ? 'teal.300' : 'gray.200'}
      borderRadius="md"
      align="center"
      px={3}
      py={2}
      justify="space-between"
      cursor="pointer"
      onClick={() => setSelectedInstanceId(instance.task_id)}
    >
      <HStack spacing={3} minW={0}>
        <Image
          src={instance.avatar}
          fallbackSrc={defaultPlatformIcon}
          boxSize="22px"
          borderRadius="sm"
        />
        <Text fontSize="sm" fontWeight="500" noOfLines={1}>
          {instance.task_id}
        </Text>
      </HStack>
      <HStack spacing={1} flexShrink={0}>
        <IconButton
          aria-label="Settings"
          icon={<SettingsIcon boxSize="14px" />}
          variant="unstyled"
          minW={8}
          h={8}
          color="gray.600"
          _hover={{ color: 'gray.900' }}
          onClick={openSettings}
        />
        <IconButton
          aria-label="Delete instance"
          icon={<DeleteIcon boxSize="14px" />}
          variant="unstyled"
          minW={8}
          h={8}
          color="red.500"
          _hover={{ color: 'red.600' }}
          onClick={() => handleDelete(instance.task_id)}
        />
      </HStack>
    </Flex>
  );
};

export default InstanceCardComponent;
