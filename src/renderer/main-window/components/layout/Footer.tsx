import React from 'react';
import { Flex, Text, Link, Tooltip } from '@chakra-ui/react';

const Footer = () => {
  return (
    <Flex
      as="footer"
      role="contentinfo"
      align="center"
      justify="space-between"
      px={4}
      h="36px"
      flexShrink={0}
      bg="white"
      borderTopWidth="1px"
      borderColor="gray.200"
      fontSize="xs"
      color="gray.500"
    >
      <Tooltip label="查看文档获取帮助">
        <Link
          href="https://doc.lazaytools.top/docs"
          isExternal
          color="gray.600"
        >
          文档
        </Link>
      </Tooltip>
      <Text>&copy; {new Date().getFullYear()} lrhh123</Text>
    </Flex>
  );
};

export default Footer;
