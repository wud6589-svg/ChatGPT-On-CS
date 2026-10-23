import React from 'react';
import {
  Flex,
  Image,
  Text,
  Badge,
  IconButton,
  Tooltip,
} from '@chakra-ui/react';
import { SettingsIcon } from '@chakra-ui/icons';
import defaultPlatformIcon from '../../../../../assets/base/default-platform-icon.png';
import windowsIcon from '../../../../../assets/base/windows.png';

type AppCardComponentProps = {
  app: {
    id: string;
    name: string;
    avatar?: string;
    env?: string;
  };
  selectedAppId: string | null;
  setSelectedAppId: React.Dispatch<React.SetStateAction<string | null>>;
  openSettings: (e: boolean) => void;
  instances: {
    task_id: string;
    app_id: string;
    env_id: string;
  }[];
};

const AppCardComponent = ({
  app,
  selectedAppId,
  setSelectedAppId,
  openSettings,
  instances,
}: AppCardComponentProps) => {
  const selected = selectedAppId === app.id;
  const appInstancesCount = instances.filter(
    (instance) => instance.app_id === app.id,
  ).length;

  return (
    <Flex
      bg={selected ? 'white' : 'transparent'}
      borderWidth="1px"
      borderColor={selected ? 'teal.400' : 'transparent'}
      borderRadius="md"
      px={2}
      py={1.5}
      align="center"
      cursor="pointer"
      _hover={{
        bg: 'white',
        borderColor: selected ? 'teal.400' : 'gray.200',
      }}
      onClick={() => {
        setSelectedAppId(app.id);
      }}
    >
      <Image
        src={app.avatar || defaultPlatformIcon}
        fallbackSrc={defaultPlatformIcon}
        boxSize="22px"
        borderRadius="sm"
        mr={2}
        flexShrink={0}
      />
      <Text
        fontSize="sm"
        fontWeight={selected ? '600' : '500'}
        color="gray.800"
        noOfLines={1}
        flex="1"
      >
        {app.name}
      </Text>
      {app.env === 'desktop' && (
        <Tooltip label="客户端应用，需要先手动打开该应用">
          <Image src={windowsIcon} boxSize="14px" ml={1} alt="desktop" />
        </Tooltip>
      )}
      {appInstancesCount > 0 && (
        <Badge
          ml={1}
          colorScheme="teal"
          borderRadius="full"
          fontSize="10px"
          px={1.5}
        >
          {appInstancesCount}
        </Badge>
      )}
      <Tooltip label={`设置 ${app.name} 平台`}>
        <IconButton
          variant="unstyled"
          aria-label={`设置 ${app.name} 平台`}
          icon={<SettingsIcon boxSize="12px" />}
          minW={5}
          h={5}
          ml={1}
          color="gray.400"
          _hover={{ color: 'gray.700' }}
          onClick={(e) => {
            e.stopPropagation();
            openSettings(true);
          }}
        />
      </Tooltip>
    </Flex>
  );
};

export default AppCardComponent;
