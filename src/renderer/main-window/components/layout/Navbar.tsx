import React from 'react';
import { Flex, Text, Button, HStack } from '@chakra-ui/react';
import { SettingsIcon, ChatIcon, CalendarIcon } from '@chakra-ui/icons';

const Navbar = () => {
  const handleOpenSettings = () => {
    window.electron.ipcRenderer.sendMessage('open-settings-window', {});
  };

  const handleOpenDataview = () => {
    window.electron.ipcRenderer.sendMessage('open-dataview-window', {});
  };

  return (
    <Flex
      as="nav"
      align="center"
      justify="space-between"
      px={4}
      h="56px"
      flexShrink={0}
      bg="white"
      borderBottomWidth="1px"
      borderColor="gray.200"
    >
      <Text
        as="h1"
        fontSize={{ base: 'xl', md: '2xl' }}
        letterSpacing="tight"
        color="gray.800"
        className="font-zh"
      >
        懒人客服
      </Text>

      <HStack spacing={1}>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<CalendarIcon />}
          onClick={handleOpenDataview}
        >
          记录
        </Button>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<ChatIcon />}
          onClick={handleOpenDataview}
        >
          关键词
        </Button>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<SettingsIcon />}
          onClick={handleOpenSettings}
        >
          设置
        </Button>
      </HStack>
    </Flex>
  );
};

export default React.memo(Navbar);
