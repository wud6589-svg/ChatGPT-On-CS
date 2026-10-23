import React, { useState } from 'react';
import {
  InputGroup,
  Input,
  InputRightElement,
  IconButton,
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';

type SearchBarComponentProps = {
  onSearch: (searchTerm: string) => void;
};

const SearchBarComponent = ({ onSearch }: SearchBarComponentProps) => {
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = () => {
    onSearch(searchTerm);
  };

  return (
    <InputGroup size="sm">
      <Input
        placeholder="搜索平台"
        value={searchTerm}
        bg="white"
        borderRadius="md"
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSearch();
          }
        }}
      />
      <InputRightElement>
        <IconButton
          icon={<SearchIcon />}
          variant="unstyled"
          aria-label="Search"
          size="xs"
          color="gray.500"
          minW={6}
          h={6}
          onClick={handleSearch}
        />
      </InputRightElement>
    </InputGroup>
  );
};

export default SearchBarComponent;
