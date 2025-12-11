/**
 * EmptyResultsState Component Test Suite
 * 
 * TDD: Tests written before implementation.
 * Quality Gate: 85% coverage required
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmptyResultsState from './EmptyResultsState';

describe('EmptyResultsState', () => {
  // ==========================================================================
  // No Data Empty State
  // ==========================================================================
  describe('No Data Empty State', () => {
    it('should render no data message with amber styling', () => {
      render(
        <EmptyResultsState
          emptyType="no_data"
          tableName="PROCESS_ENTITY"
        />
      );

      expect(screen.getByText(/no results/i)).toBeInTheDocument();
      // Should have amber/warning styling
      const container = screen.getByRole('alert') || screen.getByTestId('empty-state');
      expect(container).toHaveClass(/amber|warning/i);
    });

    it('should display the table name', () => {
      render(
        <EmptyResultsState
          emptyType="no_data"
          tableName="PROCESS_ENTITY"
        />
      );

      expect(screen.getByText(/PROCESS_ENTITY/)).toBeInTheDocument();
    });

    it('should show suggestion to try different table', () => {
      render(
        <EmptyResultsState
          emptyType="no_data"
          tableName="PROCESS_ENTITY"
        />
      );

      expect(screen.getByText(/try.*different.*table/i)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Filters Too Narrow
  // ==========================================================================
  describe('Filters Too Narrow Empty State', () => {
    it('should render filters message', () => {
      render(
        <EmptyResultsState
          emptyType="filters_narrow"
          query="SELECT * FROM TABLE WHERE status = 'active'"
        />
      );

      // Use getAllByText since "filter" appears in multiple elements
      const filterElements = screen.getAllByText(/filter/i);
      expect(filterElements.length).toBeGreaterThan(0);
    });

    it('should display the query that returned no results', () => {
      const query = "SELECT * FROM PROCESS_ENTITY WHERE guid = 'abc123'";
      render(
        <EmptyResultsState
          emptyType="filters_narrow"
          query={query}
        />
      );

      expect(screen.getByText(/WHERE/i)).toBeInTheDocument();
    });

    it('should suggest adjusting filters', () => {
      render(
        <EmptyResultsState
          emptyType="filters_narrow"
          query="SELECT * FROM TABLE WHERE status = 'active'"
        />
      );

      expect(screen.getByText(/adjust.*filter/i)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Wrong Table Selected
  // ==========================================================================
  describe('Wrong Table Empty State', () => {
    const mockTables = [
      { name: 'TABLE_ENTITY', row_count: 1500 },
      { name: 'COLUMN_ENTITY', row_count: 25000 },
      { name: 'PROCESS_ENTITY', row_count: 0 },
    ];

    it('should render table selector', () => {
      render(
        <EmptyResultsState
          emptyType="wrong_table"
          availableTables={mockTables}
          currentTable="PROCESS_ENTITY"
          onTableChange={() => {}}
        />
      );

      // Should have a dropdown/select
      expect(screen.getByRole('combobox') || screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('should show row counts next to table names', () => {
      render(
        <EmptyResultsState
          emptyType="wrong_table"
          availableTables={mockTables}
          currentTable="PROCESS_ENTITY"
          onTableChange={() => {}}
        />
      );

      expect(screen.getByText(/1,500|1.5K/)).toBeInTheDocument();
      expect(screen.getByText(/25,000|25K/)).toBeInTheDocument();
    });

    it('should highlight tables with data', () => {
      render(
        <EmptyResultsState
          emptyType="wrong_table"
          availableTables={mockTables}
          currentTable="PROCESS_ENTITY"
          onTableChange={() => {}}
        />
      );

      // Get the select element and check options
      const select = screen.getByRole('combobox');
      const options = select.querySelectorAll('option');
      
      // Find the empty and populated options by value
      const emptyOption = Array.from(options).find(opt => opt.value === 'PROCESS_ENTITY');
      const populatedOption = Array.from(options).find(opt => opt.value === 'TABLE_ENTITY');
      
      expect(emptyOption).toBeInTheDocument();
      expect(populatedOption).toBeInTheDocument();
      // Empty table should have gray styling
      expect(emptyOption).toHaveClass('text-gray-400');
      // Populated table should have dark styling
      expect(populatedOption).toHaveClass('text-gray-900');
    });

    it('should call onTableChange when table selected', async () => {
      const handleChange = vi.fn();

      render(
        <EmptyResultsState
          emptyType="wrong_table"
          availableTables={mockTables}
          currentTable="PROCESS_ENTITY"
          onTableChange={handleChange}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'TABLE_ENTITY' } });

      expect(handleChange).toHaveBeenCalledWith('TABLE_ENTITY');
    });
  });

  // ==========================================================================
  // Success with Zero Rows (distinct from error)
  // ==========================================================================
  describe('Success Zero Rows', () => {
    it('should NOT show green checkmark for 0 rows', () => {
      render(
        <EmptyResultsState
          emptyType="success_zero_rows"
          tableName="PROCESS_ENTITY"
        />
      );

      // Should NOT have green checkmark (old behavior)
      const greenCheck = screen.queryByTestId('success-checkmark');
      expect(greenCheck).not.toBeInTheDocument();
    });

    it('should show amber warning instead', () => {
      render(
        <EmptyResultsState
          emptyType="success_zero_rows"
          tableName="PROCESS_ENTITY"
        />
      );

      // Should show warning/amber
      expect(screen.getByText(/no rows returned/i)).toBeInTheDocument();
    });

    it('should indicate query was successful', () => {
      render(
        <EmptyResultsState
          emptyType="success_zero_rows"
          tableName="PROCESS_ENTITY"
        />
      );

      expect(screen.getByText(/success/i)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Common Behavior
  // ==========================================================================
  describe('Common Behavior', () => {
    it('should be accessible (have proper ARIA attributes)', () => {
      render(
        <EmptyResultsState
          emptyType="no_data"
          tableName="TEST_TABLE"
        />
      );

      // Should have role or aria-label
      const container = screen.getByRole('alert') || screen.getByTestId('empty-state');
      expect(container).toBeInTheDocument();
    });

    it('should handle missing props gracefully', () => {
      expect(() => render(<EmptyResultsState />)).not.toThrow();
    });

    it('should default to no_data type when not specified', () => {
      render(<EmptyResultsState tableName="TEST_TABLE" />);
      
      // Use getByRole to find the heading specifically
      expect(screen.getByRole('heading', { name: /no results found/i })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Actions
  // ==========================================================================
  describe('Actions', () => {
    it('should render "Try Again" button when onRetry provided', () => {
      const handleRetry = vi.fn();
      render(
        <EmptyResultsState
          emptyType="no_data"
          tableName="TEST_TABLE"
          onRetry={handleRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry|try again/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('should call onRetry when button clicked', async () => {
      const handleRetry = vi.fn();

      render(
        <EmptyResultsState
          emptyType="no_data"
          tableName="TEST_TABLE"
          onRetry={handleRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry|try again/i });
      fireEvent.click(retryButton);

      expect(handleRetry).toHaveBeenCalled();
    });
  });
});

